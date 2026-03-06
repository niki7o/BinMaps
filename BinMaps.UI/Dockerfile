FROM node:20-alpine AS build
WORKDIR /app
COPY binmaps-ui/package*.json ./
RUN npm ci --legacy-peer-deps
COPY binmaps-ui/ .
RUN npm run build -- --configuration=production

FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/binmaps-ui/browser /usr/share/nginx/html
COPY BinMaps.UI/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]