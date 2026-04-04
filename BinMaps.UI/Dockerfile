FROM node:20-alpine AS build
WORKDIR /app
COPY BinMaps.UI/binmaps-ui/package*.json ./
RUN npm ci --legacy-peer-deps
COPY BinMaps.UI/binmaps-ui/ .


ARG MAPBOX_TOKEN
RUN sed -i "s/MAPBOX_TOKEN/${MAPBOX_TOKEN}/g" \
    src/environments/environment.ts \
    src/environments/environment.prod.ts

RUN npm run build -- --configuration=production

FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/binmaps-ui/browser /usr/share/nginx/html
COPY BinMaps.UI/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]