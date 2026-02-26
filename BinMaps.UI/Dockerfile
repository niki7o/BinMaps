
FROM node:20-alpine AS build
WORKDIR /app


COPY BinMaps.UI/binmaps-ui/package*.json ./
RUN npm install --legacy-peer-deps


COPY BinMaps.UI/binmaps-ui/ .
RUN npm run build -- --configuration production


FROM nginx:alpine AS runtime
COPY --from=build /app/dist/binmaps-ui/browser /usr/share/nginx/html
COPY BinMaps.UI/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80