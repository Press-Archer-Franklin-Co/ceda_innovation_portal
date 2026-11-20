FROM node:20-alpine AS public-builder
WORKDIR /build/public
COPY innovation_portal_public/package*.json ./
RUN npm ci
COPY innovation_portal_public/ ./
ARG PUBLIC_VITE_API_URL=
ENV VITE_API_URL=${PUBLIC_VITE_API_URL}
# The build is named in the X-CEDA-Client header (S1); .git is not in the Docker context.
ARG CEDA_GIT_SHA=unknown
ENV CEDA_GIT_SHA=${CEDA_GIT_SHA}
RUN npm run build

FROM node:20-alpine AS staff-builder
WORKDIR /build/staff
COPY innovation_portal_admin/package*.json ./
RUN npm ci
COPY innovation_portal_admin/ ./
ARG STAFF_VITE_PUBLIC_URL=
ENV VITE_PUBLIC_URL=${STAFF_VITE_PUBLIC_URL}
ARG CEDA_GIT_SHA=unknown
ENV CEDA_GIT_SHA=${CEDA_GIT_SHA}
RUN npm run build

FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/edge/nginx.conf /etc/nginx/nginx.conf
COPY deploy/edge/public.conf /etc/nginx/conf.d/public.conf
COPY deploy/edge/staff.conf /etc/nginx/conf.d/staff.conf
COPY --from=public-builder /build/public/dist/ /usr/share/nginx/html/public/
COPY --from=staff-builder /build/staff/dist/ /usr/share/nginx/html/staff/
