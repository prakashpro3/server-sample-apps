FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV VITE_API_URL=https://api-prakash.zorai.cloud/
RUN npm run build

FROM nginx:alpine

# Replace FULL nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Remove default server configs
RUN rm -f /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]