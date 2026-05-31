FROM node:22-alpine

WORKDIR /usr/src/app

# Copy package manifests and install all dependencies so build tools are available
COPY package*.json ./

RUN npm ci

# Copy application code and build the production output
COPY . .
RUN npm run build
RUN npx prisma generate
RUN npm prune --production

EXPOSE 3000

# Execute the application via the updated package script string
CMD ["npm", "run", "start:prod"]