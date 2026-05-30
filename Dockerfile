FROM node:22-alpine

WORKDIR /usr/src/app

# Copy manifestations and manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install only production-specific dependency trees
RUN npm ci --omit=dev

# Copy all code, including your perfectly compiled local 'dist' folder
COPY . .

# Generate the explicit Prisma 7 query client binary adapters
RUN npx prisma generate

EXPOSE 3000

# Execute the application via the updated package script string
CMD ["npm", "run", "start:prod"]