# ---------- Stage 1: Build Angular ----------
FROM node:20-alpine AS build

WORKDIR /app

# Copy only package files first (for Docker cache)
COPY binmaps-ui/package*.json ./

# Install Linux-compatible dependencies
RUN npm ci --legacy-peer-deps

# Copy rest of project
COPY binmaps-ui/ .

# Build Angular
RUN npm run build -- --configuration=production



FROM nginx:alpine

COPY --from=build /app/dist/binmaps-ui/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]