# Step 1: Build the React app
FROM node:22

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

ENV VITE_API_URL=http://143.110.231.76:3000

# Copy the rest of the app's source code
COPY . .

# Build the React app for production
RUN npm run build

# Expose the port (default port for serve is 4001)
EXPOSE 5173

# Run the Next.js app
CMD ["nginx", "-g", "daemon off;"]