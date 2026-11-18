from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import jwt
from django.conf import settings
from django.contrib.auth import authenticate
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import SocialAuthProvider, SocialAuthState

logger = logging.getLogger(__name__)


def _http_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, data: dict[str, Any] | None = None):
    body = None
    request_headers = headers or {}
    if data is not None:
        body = urlencode(data).encode()
        request_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    request = Request(url, data=body, headers=request_headers, method=method)
    with urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode())


class IdentityTrustLevel:
    LOCAL = "local"
    STRONG = "strong"
    MEDIUM = "medium"


@dataclass
class NormalizedIdentity:
    provider: str
    provider_user_id: str
    email: str
    email_verified: bool
    first_name: str
    last_name: str
    display_name: str
    username: str
    avatar_url: str
    raw_claims: dict[str, Any]
    trust_level: str

    @property
    def allows_email_linking(self) -> bool:
        return bool(self.email and self.email_verified)


class BaseIdentityProvider:
    provider: str = ""
    display_name: str = ""

    def config(self) -> dict[str, str]:
        raise NotImplementedError

    def required_config_keys(self) -> dict[str, str]:
        return {
            "client_id": f"{self.provider.upper()}_CLIENT_ID",
            "client_secret": f"{self.provider.upper()}_CLIENT_SECRET",
            "redirect_uri": f"{self.provider.upper()}_REDIRECT_URI",
        }

    def missing_config_keys(self) -> list[str]:
        config = self.config()
        required = self.required_config_keys()
        return [env_name for key, env_name in required.items() if not config.get(key)]

    def is_enabled(self) -> bool:
        return not self.missing_config_keys()

    def authorization_url(self, *, state: str, nonce: str) -> tuple[str, str]:
        raise NotImplementedError

    def fetch_identity(self, *, code: str, state_record: SocialAuthState) -> NormalizedIdentity:
        raise NotImplementedError

    @staticmethod
    def _split_name(full_name: str, email: str) -> tuple[str, str]:
        name = (full_name or "").strip()
        if name:
            parts = name.split()
            if len(parts) == 1:
                return parts[0], "User"
            return parts[0], " ".join(parts[1:])
        local = (email or "ceda").split("@")[0].replace(".", " ").replace("_", " ").strip()
        parts = [part for part in local.split() if part]
        if not parts:
            return "CEDA", "User"
        if len(parts) == 1:
            return parts[0].title(), "User"
        return parts[0].title(), " ".join(part.title() for part in parts[1:])


class LocalPasswordIdentityProvider(BaseIdentityProvider):
    provider = "password"
    display_name = "Email and Password"

    def config(self) -> dict[str, str]:
        return {}

    def authenticate_identity(self, *, email: str, password: str) -> NormalizedIdentity | None:
        user = authenticate(email=email, password=password)
        if not user:
            return None
        return NormalizedIdentity(
            provider=self.provider,
            provider_user_id=str(user.id),
            email=user.email,
            email_verified=bool(user.email_verified),
            first_name=user.first_name,
            last_name=user.last_name,
            display_name=user.full_name,
            username=user.email,
            avatar_url="",
            raw_claims={},
            trust_level=IdentityTrustLevel.LOCAL,
        )


class OIDCIdentityProvider(BaseIdentityProvider):
    discovery_url: str = ""
    issuer_allowlist: tuple[str, ...] = ()
    scopes: str = "openid email profile"

    def _discovery(self):
        return _http_json(self.discovery_url)

    def authorization_url(self, *, state: str, nonce: str) -> tuple[str, str]:
        config = self.config()
        discovery = self._discovery()
        params = {
            "client_id": config["client_id"],
            "redirect_uri": config["redirect_uri"],
            "response_type": "code",
            "scope": self.scopes,
            "state": state,
            "nonce": nonce,
        }
        return f'{discovery["authorization_endpoint"]}?{urlencode(params)}', config["redirect_uri"]

    def fetch_identity(self, *, code: str, state_record: SocialAuthState) -> NormalizedIdentity:
        claims = self.exchange_code_for_claims(code=code, state_record=state_record)
        return self.identity_from_claims(claims)

    def exchange_code_for_claims(self, *, code: str, state_record: SocialAuthState) -> dict[str, Any]:
        """Swap the authorization code for an id_token and return its verified claims."""
        config = self.config()
        discovery = self._discovery()
        token_data = _http_json(
            discovery["token_endpoint"],
            method="POST",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": state_record.redirect_uri,
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
            },
            headers={"Accept": "application/json"},
        )
        id_token = token_data.get("id_token")
        if not id_token:
            raise ValidationError({"provider": "Provider token response did not include an id_token."})
        signing_key = jwt.PyJWKClient(discovery["jwks_uri"]).get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=config["client_id"],
            issuer=self.issuer_allowlist or discovery["issuer"],
            options={"verify_exp": True},
        )
        if state_record.nonce and claims.get("nonce") != state_record.nonce:
            raise ValidationError({"provider": "Invalid social login nonce."})
        return claims

    def identity_from_claims(self, claims: dict[str, Any]) -> NormalizedIdentity:
        email = claims.get("email")
        if not email:
            raise ValidationError({"email": "The provider did not supply an email address."})
        verified = bool(claims.get("email_verified"))
        if not verified:
            raise ValidationError({"email": "The provider email address is not verified."})
        first_name, last_name = self._split_name(claims.get("name", ""), email)
        return NormalizedIdentity(
            provider=self.provider,
            provider_user_id=str(claims.get("sub")),
            email=email,
            email_verified=verified,
            first_name=claims.get("given_name") or first_name,
            last_name=claims.get("family_name") or last_name,
            display_name=claims.get("name", "").strip(),
            username=email,
            avatar_url="",
            raw_claims={"claims": claims},
            trust_level=IdentityTrustLevel.STRONG,
        )


class GoogleIdentityProvider(OIDCIdentityProvider):
    provider = SocialAuthProvider.GOOGLE
    display_name = "Google"
    discovery_url = "https://accounts.google.com/.well-known/openid-configuration"
    issuer_allowlist = ("https://accounts.google.com", "accounts.google.com")

    def config(self) -> dict[str, str]:
        return {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        }


class MicrosoftIdentityProvider(OIDCIdentityProvider):
    provider = SocialAuthProvider.MICROSOFT
    display_name = "Microsoft"
    scopes = "openid email profile User.Read"

    @property
    def discovery_url(self) -> str:
        tenant = settings.MICROSOFT_OAUTH_TENANT_ID
        return f"https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration"

    @property
    def issuer_allowlist(self) -> tuple[str, ...]:
        tenant = settings.MICROSOFT_OAUTH_TENANT_ID
        return (
            f"https://login.microsoftonline.com/{tenant}/v2.0",
            f"https://sts.windows.net/{tenant}/",
        )

    def config(self) -> dict[str, str]:
        return {
            "client_id": settings.MICROSOFT_CLIENT_ID,
            "client_secret": settings.MICROSOFT_CLIENT_SECRET,
            "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
            "tenant_id": settings.MICROSOFT_OAUTH_TENANT_ID,
        }

    def required_config_keys(self) -> dict[str, str]:
        required = super().required_config_keys()
        required["tenant_id"] = "MICROSOFT_OAUTH_TENANT_ID"
        return required


class StaffSSORefused(PermissionDenied):
    default_detail = "This account is not allowed to use CEDA staff sign-in."
    default_code = "staff_sso_refused"


class CedaStaffIdentityProvider(OIDCIdentityProvider):
    """Single sign-on for CEDA staff through any OIDC provider (for example Microsoft Entra ID).

    Configured only through environment variables (see .env.production.example):
    CEDA_SSO_CLIENT_ID, CEDA_SSO_CLIENT_SECRET, CEDA_SSO_REDIRECT_URI, CEDA_SSO_DISCOVERY_URL,
    and optionally CEDA_SSO_ISSUER, CEDA_SSO_SCOPES, CEDA_SSO_GROUPS_CLAIM.

    Sign-in is refused unless the email domain is in CEDA_SSO_ALLOWED_DOMAINS or one of the
    user's groups is in CEDA_SSO_ALLOWED_GROUPS. With both lists empty, nobody is let in.
    """

    provider = SocialAuthProvider.CEDA_STAFF
    display_name = "CEDA staff sign-in"

    @property
    def discovery_url(self) -> str:
        return getattr(settings, "CEDA_SSO_DISCOVERY_URL", "")

    @property
    def issuer_allowlist(self) -> tuple[str, ...]:
        issuer = getattr(settings, "CEDA_SSO_ISSUER", "")
        return (issuer,) if issuer else ()

    @property
    def scopes(self) -> str:
        return getattr(settings, "CEDA_SSO_SCOPES", "") or "openid email profile"

    def config(self) -> dict[str, str]:
        return {
            "client_id": getattr(settings, "CEDA_SSO_CLIENT_ID", ""),
            "client_secret": getattr(settings, "CEDA_SSO_CLIENT_SECRET", ""),
            "redirect_uri": getattr(settings, "CEDA_SSO_REDIRECT_URI", ""),
            "discovery_url": getattr(settings, "CEDA_SSO_DISCOVERY_URL", ""),
        }

    def required_config_keys(self) -> dict[str, str]:
        return {
            "client_id": "CEDA_SSO_CLIENT_ID",
            "client_secret": "CEDA_SSO_CLIENT_SECRET",
            "redirect_uri": "CEDA_SSO_REDIRECT_URI",
            "discovery_url": "CEDA_SSO_DISCOVERY_URL",
        }

    @staticmethod
    def _setting_list(name: str) -> list[str]:
        raw = getattr(settings, name, []) or []
        if isinstance(raw, str):
            raw = raw.split(",")
        return [item.strip().lower() for item in raw if item and item.strip()]

    @classmethod
    def allowed_domains(cls) -> list[str]:
        return [domain.lstrip("@") for domain in cls._setting_list("CEDA_SSO_ALLOWED_DOMAINS")]

    @classmethod
    def allowed_groups(cls) -> list[str]:
        return cls._setting_list("CEDA_SSO_ALLOWED_GROUPS")

    @staticmethod
    def _email_from_claims(claims: dict[str, Any]) -> str:
        # Entra ID often leaves out `email` and puts the address in preferred_username / upn.
        for key in ("email", "preferred_username", "upn"):
            value = (claims.get(key) or "").strip()
            if "@" in value:
                return value.lower()
        return ""

    @staticmethod
    def _groups_from_claims(claims: dict[str, Any]) -> list[str]:
        claim_name = getattr(settings, "CEDA_SSO_GROUPS_CLAIM", "") or "groups"
        groups = claims.get(claim_name) or []
        if isinstance(groups, str):
            groups = [groups]
        return [str(group).strip().lower() for group in groups if str(group).strip()]

    @classmethod
    def check_allow_list(cls, *, email: str, groups: list[str]) -> str:
        """Return why the user is allowed (``domain`` or ``group``) or raise StaffSSORefused."""
        domain = email.rsplit("@", 1)[-1] if "@" in email else ""
        if domain and domain in cls.allowed_domains():
            return "domain"
        if set(groups) & set(cls.allowed_groups()):
            return "group"
        raise StaffSSORefused()

    def identity_from_claims(self, claims: dict[str, Any]) -> NormalizedIdentity:
        email = self._email_from_claims(claims)
        groups = self._groups_from_claims(claims)
        if not email:
            raise ValidationError({"email": "The staff directory did not supply an email address."})
        try:
            matched_by = self.check_allow_list(email=email, groups=groups)
        except StaffSSORefused:
            from apps.audit.services import AuditService

            AuditService.log_raw_action(
                actor=None,
                action_type="staff_sso_refused",
                target_model="Identity",
                target_id=str(claims.get("sub") or email),
                metadata={"provider": self.provider, "email_domain": email.rsplit("@", 1)[-1], "group_count": len(groups)},
            )
            raise
        first_name, last_name = self._split_name(claims.get("name", ""), email)
        return NormalizedIdentity(
            provider=self.provider,
            provider_user_id=str(claims.get("oid") or claims.get("sub")),
            email=email,
            # The organisation's own directory vouches for the address, and it passed the allow list.
            email_verified=True,
            first_name=claims.get("given_name") or first_name,
            last_name=claims.get("family_name") or last_name,
            display_name=(claims.get("name") or "").strip(),
            username=email,
            avatar_url="",
            raw_claims={"claims": claims, "groups": groups, "allowed_by": matched_by},
            trust_level=IdentityTrustLevel.STRONG,
        )


class GitHubIdentityProvider(BaseIdentityProvider):
    provider = SocialAuthProvider.GITHUB
    display_name = "GitHub"

    def config(self) -> dict[str, str]:
        return {
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "redirect_uri": settings.GITHUB_REDIRECT_URI,
        }

    def authorization_url(self, *, state: str, nonce: str) -> tuple[str, str]:
        del nonce
        config = self.config()
        params = {
            "client_id": config["client_id"],
            "redirect_uri": config["redirect_uri"],
            "scope": "read:user user:email",
            "state": state,
        }
        return f"https://github.com/login/oauth/authorize?{urlencode(params)}", config["redirect_uri"]

    @staticmethod
    def select_verified_email(emails: list[dict[str, Any]]) -> dict[str, Any] | None:
        verified_emails = [item for item in emails if item.get("verified") and item.get("email")]
        if not verified_emails:
            return None
        primary_verified = next((item for item in verified_emails if item.get("primary")), None)
        if primary_verified:
            return primary_verified
        verified_emails.sort(key=lambda item: item.get("email", "").lower())
        return verified_emails[0]

    def fetch_identity(self, *, code: str, state_record: SocialAuthState) -> NormalizedIdentity:
        config = self.config()
        token_data = _http_json(
            "https://github.com/login/oauth/access_token",
            method="POST",
            data={
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "code": code,
                "redirect_uri": state_record.redirect_uri,
                "state": state_record.state,
            },
            headers={"Accept": "application/json"},
        )
        access_token = token_data.get("access_token")
        if not access_token:
            raise ValidationError({"provider": "GitHub did not return an access token."})
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "ceda-innovation-portal",
        }
        profile = _http_json("https://api.github.com/user", headers=headers)
        emails = _http_json("https://api.github.com/user/emails", headers=headers)
        primary = self.select_verified_email(emails)
        if not primary or not primary.get("email"):
            raise ValidationError({"email": "GitHub did not provide a verified email address."})
        first_name, last_name = self._split_name(profile.get("name") or profile.get("login") or "", primary["email"])
        return NormalizedIdentity(
            provider=self.provider,
            provider_user_id=str(profile["id"]),
            email=primary["email"],
            email_verified=bool(primary.get("verified")),
            first_name=first_name,
            last_name=last_name,
            display_name=profile.get("name") or profile.get("login") or primary["email"],
            username=profile.get("login") or primary["email"],
            avatar_url=profile.get("avatar_url") or "",
            raw_claims={"login": profile.get("login"), "avatar_url": profile.get("avatar_url")},
            trust_level=IdentityTrustLevel.MEDIUM,
        )


class IdentityProviderRegistry:
    PROVIDERS = {
        SocialAuthProvider.GOOGLE: GoogleIdentityProvider(),
        SocialAuthProvider.GITHUB: GitHubIdentityProvider(),
        SocialAuthProvider.MICROSOFT: MicrosoftIdentityProvider(),
        SocialAuthProvider.CEDA_STAFF: CedaStaffIdentityProvider(),
    }
    LOCAL_PROVIDER = LocalPasswordIdentityProvider()

    @classmethod
    def get(cls, provider: str) -> BaseIdentityProvider:
        try:
            return cls.PROVIDERS[provider]
        except KeyError as exc:
            raise ValidationError({"provider": f"Unsupported social login provider `{provider}`."}) from exc

    @classmethod
    def list_social_providers(cls) -> list[dict[str, Any]]:
        return [
            {"id": provider_id, "name": provider.display_name, "enabled": provider.is_enabled()}
            for provider_id, provider in cls.PROVIDERS.items()
        ]

    @classmethod
    def enabled_providers(cls) -> list[str]:
        return [provider_id for provider_id, provider in cls.PROVIDERS.items() if provider.is_enabled()]

    @classmethod
    def ensure_enabled(cls, provider: str) -> BaseIdentityProvider:
        identity_provider = cls.get(provider)
        missing_keys = identity_provider.missing_config_keys() if hasattr(identity_provider, "missing_config_keys") else []
        if missing_keys:
            logger.warning(
                "%s OAuth disabled: missing %s",
                identity_provider.display_name or provider.title(),
                ", ".join(missing_keys),
            )
            raise ValidationError({"provider": f"{provider} social login is disabled or misconfigured."})
        return identity_provider

    @classmethod
    def password_provider(cls) -> LocalPasswordIdentityProvider:
        return cls.LOCAL_PROVIDER

    @classmethod
    def provider_diagnostics(cls) -> list[dict[str, Any]]:
        diagnostics: list[dict[str, Any]] = []
        for provider_id, provider in cls.PROVIDERS.items():
            missing_keys = provider.missing_config_keys()
            diagnostics.append(
                {
                    "id": provider_id,
                    "name": provider.display_name,
                    "enabled": not missing_keys,
                    "missing_config_keys": missing_keys,
                }
            )
        return diagnostics
