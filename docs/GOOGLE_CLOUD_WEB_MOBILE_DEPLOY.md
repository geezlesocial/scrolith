# Google Cloud Web Mobile Frontend Deploy

Use this when the frontend/web-mobile code is ready locally and must be deployed to the live Google Cloud Run frontend service.

## 1. Build locally first

From PowerShell:

```powershell
cd C:\Projects\geezle
npm run build
```

Do not continue if the build fails.

## 2. Package the frontend context

```powershell
cd C:\Projects\geezle

$CTX="C:\Projects\scrolith-frontend-gcp-context-webmobile"
$ZIP="C:\Projects\scrolith-frontend-gcp-context-webmobile.zip"

Remove-Item $CTX -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ZIP -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $CTX | Out-Null

Copy-Item package.json,package-lock.json,index.html -Destination $CTX -Force
Copy-Item src -Destination $CTX -Recurse -Force
Copy-Item public -Destination $CTX -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item scripts -Destination $CTX -Recurse -Force -ErrorAction SilentlyContinue

Get-ChildItem -Path . -File | Where-Object {
  $_.Name -like "vite.config.*" -or
  $_.Name -like "tsconfig*.json" -or
  $_.Name -like "tailwind.config.*" -or
  $_.Name -like "postcss.config.*" -or
  $_.Name -eq "components.json"
} | Copy-Item -Destination $CTX -Force

Compress-Archive -Path "$CTX\*" -DestinationPath $ZIP -Force
Get-Item $ZIP
```

Upload `C:\Projects\scrolith-frontend-gcp-context-webmobile.zip` to Cloud Shell.

## 3. Prepare Cloud Shell context

```bash
gcloud config set project scrolith-prod

rm -rf frontend_ctx
mkdir frontend_ctx
unzip -q scrolith-frontend-gcp-context-webmobile.zip -d frontend_ctx
cd frontend_ctx

chmod -R u+rwX,go+rX .
find . -type d -exec chmod 755 {} \;
find . -type f -exec chmod 644 {} \;
```

## 4. Add production Nginx and Docker files

```bash
cat > nginx.conf <<'EOF'
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_vary on;
  gzip_comp_level 6;
  gzip_min_length 1024;
  gzip_types text/plain text/css text/xml application/json application/javascript application/xml application/rss+xml image/svg+xml;

  location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2)$ {
    expires 365d;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  location / {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    try_files $uri $uri/ /index.html;
  }
}
EOF

cat > Dockerfile <<'EOF'
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ARG VITE_BACKEND_URL
ARG VITE_PUBLIC_APP_DOMAIN
ARG VITE_PUBLIC_APP_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_PUBLIC_APP_DOMAIN=$VITE_PUBLIC_APP_DOMAIN
ENV VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
EOF
```

## 5. Build and push the frontend image

```bash
PROJECT_ID="scrolith-prod"
REGION="us-central1"
TAG=$(date +%Y%m%d%H%M%S)
FRONTEND_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/scrolith/scrolith-frontend:webmobile-$TAG"

cat > cloudbuild.yaml <<EOF
steps:
- name: 'gcr.io/cloud-builders/docker'
  args:
  - build
  - -t
  - $FRONTEND_IMAGE
  - --build-arg
  - VITE_API_URL=https://api.scrolith.com/api
  - --build-arg
  - VITE_BACKEND_URL=https://api.scrolith.com
  - --build-arg
  - VITE_PUBLIC_APP_DOMAIN=scrolith.com
  - --build-arg
  - VITE_PUBLIC_APP_URL=https://scrolith.com
  - .
images:
- $FRONTEND_IMAGE
EOF

gcloud builds submit . --config cloudbuild.yaml
echo "$FRONTEND_IMAGE" > ~/scrolith-frontend-image.txt
cat ~/scrolith-frontend-image.txt
```

Only deploy if Cloud Build finishes with `STATUS: SUCCESS`.

## 6. Deploy frontend only

```bash
gcloud run deploy scrolith-frontend \
  --image "$(cat ~/scrolith-frontend-image.txt)" \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --service-account "scrolith-runner@scrolith-prod.iam.gserviceaccount.com" \
  --set-env-vars "NODE_ENV=production" \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 1 \
  --cpu-boost \
  --concurrency 80 \
  --max-instances 3
```

## 7. Verify production

```bash
curl -I https://scrolith.com
curl -I https://www.scrolith.com
curl -i https://api.scrolith.com/api/health
curl -i https://api.scrolith.com/api/cms/auth-pages
curl -i "https://api.scrolith.com/api/gigs?status=active&limit=3&random=true"
```

Manual checks:

- Guest homepage shows the Scrolith guest design.
- Google and LinkedIn social auth buttons show on the guest hero, popup, `/auth/login`, and `/auth/signup`.
- Social auth logos match the admin-uploaded logos.
- Footer remains hidden on routes hidden by admin settings.
- Marketplace preview shows live public gigs instead of the static “Feature preview” placeholder.
- Mobile popup scrolls to the bottom and all buttons are reachable.

## 8. Rollback

Find the previous revision:

```bash
gcloud run revisions list --service scrolith-frontend --region us-central1
```

Route traffic back to the prior stable revision:

```bash
gcloud run services update-traffic scrolith-frontend \
  --region us-central1 \
  --to-revisions PREVIOUS_REVISION=100
```
