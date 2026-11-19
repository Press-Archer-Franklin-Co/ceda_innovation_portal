"""Staff single sign-on providers: Microsoft Entra ID, Google Workspace and any OIDC issuer."""

from __future__ import annotations

import time
from urllib.parse import urlparse

from django.conf import settings

from apps.core.constants import RoleType
from apps.platform_config import http
from apps.platform_config.providers.base import (
    SSO_ASSIGNABLE_ROLES,
    BaseProvider,
    FieldSpec,
    FieldType,
    TestReport,
    register,
)

SSO_SHARED_FIELDS = (
    FieldSpec(
        "allowed_domains",
        "Allowed email domains",
        FieldType.LIST,
        default=["ceda.co.bw"],
        help_text="People whose email ends in one of these domains may sign in. One per line.",
    ),
    FieldSpec(
        "allowed_groups",
        "Allowed groups",
        FieldType.LIST,
        default=[],
        help_text="Group IDs or names from the directory. Members may sign in even with another email domain.",
    ),
    FieldSpec(
        "group_role_map",
        "Group to role mapping",
        FieldType.MAPPING,
        default={},
        help_text="Give a role to members of a group the first time they sign in. Administrator cannot be mapped.",
    ),
    FieldSpec(
        "default_role",
        "Default role",
        FieldType.SELECT,
        default=RoleType.STAFF_MEMBER,
        choices=SSO_ASSIGNABLE_ROLES,
        help_text="Role for a new staff user who matches no group mapping. Existing roles are never changed.",
    ),
)


def callback_url() -> str:
    """Where the provider sends people back: the portal's sign-in callback page."""
    return f"{settings.PUBLIC_BASE_URL.rstrip('/')}/auth/callback"


class BaseSSOProvider(BaseProvider):
    kind = "sso"
    shared_fields = SSO_SHARED_FIELDS
    scopes = "openid email profile"
    email_claims: tuple[str, ...] = ("email", "preferred_username", "upn")

    # -- values the runtime and the test both need ----------------------------

    def discovery_url(self) -> str:
        raise NotImplementedError

    def expected_issuer(self) -> str:
        return ""

    def extra_auth_params(self) -> dict:
        return {}

    def runtime_settings(self) -> dict:
        """Settings in the shape CedaStaffIdentityProvider reads."""
        return {
            "client_id": self.config.get("client_id", ""),
            "client_secret": self.secrets.get("client_secret", ""),
            "redirect_uri": callback_url(),
            "discovery_url": self.discovery_url(),
            "issuer": self.expected_issuer(),
            "scopes": self.config.get("scopes") or self.scopes,
            "allowed_domains": self.config.get("allowed_domains") or [],
            "allowed_groups": self.config.get("allowed_groups") or [],
            "group_role_map": self.config.get("group_role_map") or {},
            "default_role": self.config.get("default_role") or RoleType.STAFF_MEMBER,
            "groups_claim": self.config.get("groups_claim") or "groups",
            "email_claims": tuple(filter(None, [self.config.get("email_claim")])) or self.email_claims,
            "name_claim": self.config.get("name_claim") or "name",
            "extra_auth_params": self.extra_auth_params(),
            "hosted_domain": self.config.get("hosted_domain", ""),
        }

    @classmethod
    def validate(cls, config: dict, secrets: dict) -> tuple[dict, list[str]]:
        errors: dict[str, str] = {}
        warnings: list[str] = []
        if config.get("default_role") == RoleType.ADMINISTRATOR:
            errors["default_role"] = "Administrator cannot be the default role."
        allowed_roles = {value for value, _ in SSO_ASSIGNABLE_ROLES}
        bad = sorted({role for role in (config.get("group_role_map") or {}).values() if role not in allowed_roles})
        if bad:
            errors["group_role_map"] = (
                "Administrator cannot be mapped."
                if RoleType.ADMINISTRATOR in bad
                else f"Unknown role(s): {', '.join(bad)}."
            )
        if not (config.get("allowed_domains") or []) and not (config.get("allowed_groups") or []):
            warnings.append("Both allow lists are empty, so nobody will be able to sign in.")
        return errors, warnings

    # -- test ---------------------------------------------------------------

    def check_credentials(self, discovery: dict) -> tuple[bool, str, bool]:
        """Return (ok, detail, skipped). Default: cannot be checked before a real sign-in."""
        return True, "Checked at first sign-in: this provider cannot check the client secret in advance.", True

    def test(self, **inputs) -> TestReport:
        report = TestReport()
        missing = self.missing_required(self.config, self.secrets)
        report.add("Settings complete", not missing, f"Missing: {', '.join(missing)}." if missing else "All required settings are filled in.")
        if missing:
            return report

        state: dict = {}

        def load_discovery():
            result = http.request(self.discovery_url())
            if not result.ok or not isinstance(result.body, dict):
                return False, result.error or f"Could not load {self.discovery_url()} (HTTP {result.status})."
            state["discovery"] = result.body
            return True, f"Loaded the discovery document in {result.elapsed_ms} ms."

        if not report.run("Discovery document loads", load_discovery):
            return report
        discovery = state["discovery"]

        def check_issuer():
            expected = self.expected_issuer()
            actual = discovery.get("issuer", "")
            if not actual:
                return False, "The discovery document has no issuer."
            if expected and actual.rstrip("/") != expected.rstrip("/"):
                return False, f"Issuer is {actual}, expected {expected}."
            return True, f"Issuer is {actual}."

        report.run("Issuer matches", check_issuer)

        def load_keys():
            jwks_uri = discovery.get("jwks_uri")
            if not jwks_uri:
                return False, "The discovery document has no jwks_uri."
            result = http.request(jwks_uri)
            keys = (result.body or {}).get("keys") if isinstance(result.body, dict) else None
            if not result.ok or not keys:
                return False, result.error or f"Could not load signing keys (HTTP {result.status})."
            return True, f"Loaded {len(keys)} signing key(s)."

        report.run("Signing keys load", load_keys)

        started = time.monotonic()
        ok, detail, skipped = self.check_credentials(discovery)
        report.add(
            "Client ID and secret accepted",
            ok,
            detail,
            int((time.monotonic() - started) * 1000),
            skipped=skipped,
        )
        return report

    def _client_credentials_check(self, discovery: dict, scope: str) -> tuple[bool, str, bool]:
        token_endpoint = discovery.get("token_endpoint")
        if not token_endpoint:
            return False, "The discovery document has no token_endpoint.", False
        result = http.request(
            token_endpoint,
            method="POST",
            form={
                "grant_type": "client_credentials",
                "client_id": self.config.get("client_id", ""),
                "client_secret": self.secrets.get("client_secret", ""),
                "scope": scope,
            },
        )
        body = result.body if isinstance(result.body, dict) else {}
        if result.ok and body.get("access_token"):
            return True, "The token endpoint accepted the client ID and secret.", False
        error = body.get("error", "")
        if error in {"invalid_client", "unauthorized_client"} and "secret" in (body.get("error_description") or "").lower():
            return False, "The token endpoint refused the client secret.", False
        if error == "invalid_client":
            return False, "The token endpoint refused the client ID or secret.", False
        if result.error:
            return False, result.error, False
        return True, "Could not be checked in advance (the provider does not allow it); it will be checked at first sign-in.", True


@register
class MicrosoftEntraProvider(BaseSSOProvider):
    key = "microsoft_entra"
    label = "Microsoft Entra ID"
    description = "CEDA staff sign in with their Microsoft 365 account."
    setup_steps = (
        "In the Entra admin centre, open App registrations and choose New registration.",
        "Add a Web redirect URI and paste the redirect URI shown here.",
        "Under Certificates & secrets, create a client secret and paste its value here.",
        "Copy the Directory (tenant) ID and Application (client) ID into this form.",
        "To use groups, add the groups claim under Token configuration.",
    )
    fields = (
        FieldSpec("tenant_id", "Directory (tenant) ID", required=True, help_text="Use your tenant ID, not 'common'."),
        FieldSpec("client_id", "Application (client) ID", required=True),
        FieldSpec("client_secret", "Client secret", required=True, secret=True),
    )

    def _tenant(self) -> str:
        return (self.config.get("tenant_id") or "").strip()

    def discovery_url(self) -> str:
        return f"https://login.microsoftonline.com/{self._tenant()}/v2.0/.well-known/openid-configuration"

    def expected_issuer(self) -> str:
        return f"https://login.microsoftonline.com/{self._tenant()}/v2.0"

    @classmethod
    def validate(cls, config, secrets):
        errors, warnings = super().validate(config, secrets)
        if (config.get("tenant_id") or "").strip().lower() in {"common", "organizations", "consumers"}:
            errors["tenant_id"] = "Use your organisation's tenant ID so only CEDA accounts are accepted."
        return errors, warnings

    def check_credentials(self, discovery):
        return self._client_credentials_check(discovery, "https://graph.microsoft.com/.default")


@register
class GoogleWorkspaceProvider(BaseSSOProvider):
    key = "google_workspace"
    label = "Google Workspace"
    description = "Staff sign in with their Google Workspace account."
    email_claims = ("email",)
    setup_steps = (
        "In Google Cloud console, open APIs & Services > Credentials and create an OAuth client ID (Web application).",
        "Add the redirect URI shown here as an authorised redirect URI.",
        "Copy the client ID and secret into this form and enter your Workspace domain.",
        "Google does not send groups in the sign-in token, so use allowed email domains.",
    )
    fields = (
        FieldSpec("client_id", "Client ID", required=True),
        FieldSpec("client_secret", "Client secret", required=True, secret=True),
        FieldSpec("hosted_domain", "Workspace domain", required=True, placeholder="ceda.co.bw", help_text="Only accounts in this Google Workspace domain are accepted."),
    )

    def discovery_url(self) -> str:
        return "https://accounts.google.com/.well-known/openid-configuration"

    def expected_issuer(self) -> str:
        return "https://accounts.google.com"

    def extra_auth_params(self) -> dict:
        domain = (self.config.get("hosted_domain") or "").strip()
        return {"hd": domain} if domain else {}


@register
class GenericOIDCProvider(BaseSSOProvider):
    key = "generic_oidc"
    label = "Other OpenID Connect provider"
    description = "Any directory that supports OpenID Connect (Okta, Keycloak, Auth0 and others)."
    setup_steps = (
        "Create a confidential web client in your identity provider.",
        "Register the redirect URI shown here.",
        "Enter the issuer URL (the discovery document is read from <issuer>/.well-known/openid-configuration).",
        "If your provider names claims differently, set the claim names below.",
    )
    fields = (
        FieldSpec("issuer_url", "Issuer URL", FieldType.URL, required=True, placeholder="https://id.example.com/realms/ceda"),
        FieldSpec("client_id", "Client ID", required=True),
        FieldSpec("client_secret", "Client secret", required=True, secret=True),
        FieldSpec("scopes", "Scopes", default="openid email profile"),
        FieldSpec("email_claim", "Email claim", default="email"),
        FieldSpec("name_claim", "Name claim", default="name"),
        FieldSpec("groups_claim", "Groups claim", default="groups"),
    )

    def _issuer(self) -> str:
        return (self.config.get("issuer_url") or "").strip().rstrip("/")

    def discovery_url(self) -> str:
        return f"{self._issuer()}/.well-known/openid-configuration"

    def expected_issuer(self) -> str:
        return self._issuer()

    @classmethod
    def validate(cls, config, secrets):
        errors, warnings = super().validate(config, secrets)
        issuer = (config.get("issuer_url") or "").strip()
        if issuer and urlparse(issuer).scheme != "https":
            errors["issuer_url"] = "The issuer URL must use https://."
        return errors, warnings

    def check_credentials(self, discovery):
        return self._client_credentials_check(discovery, self.config.get("scopes") or "openid")
