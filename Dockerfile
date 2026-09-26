# Stage 1: Build
FROM node:24-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy project files
COPY . .

# Build arguments with defaults
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG MAPBOX_ACCESS_TOKEN=

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_DISABLE_SSG=true
ENV SKIP_ENV_VALIDATION=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV MAPBOX_ACCESS_TOKEN=$MAPBOX_ACCESS_TOKEN

# Build the application
RUN npm run build:no-ssg

# Stage 2: Production runtime
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy Next.js standalone output (minimal bundle)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy public files
COPY --from=builder /app/public ./public

# Copy locales
COPY --from=builder /app/locales ./locales

# Copy entrypoint script
COPY entrypoint.sh ./entrypoint.sh
# Ensure LF line endings (Windows CRLF fix)
RUN sed -i 's/\r$//' entrypoint.sh || true
RUN chmod +x entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Run entrypoint script
CMD ["./entrypoint.sh"]
