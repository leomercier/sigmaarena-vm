FROM node:24-alpine

RUN addgroup -S sandbox && adduser -S sandbox -G sandbox

WORKDIR /app

RUN npm install -g typescript tsx

# Install allowed npm packages
RUN npm install axios lodash dayjs uuid zod zod-to-json-schema

COPY runner.ts /app/runner.ts

# Create directories with restricted permissions
RUN mkdir -p /app/scripts
RUN mkdir -p /app/output

RUN chown -R sandbox:sandbox /app
RUN chmod 755 /app/scripts /app/output

USER sandbox

# Set resource limits (enforced by Docker run command)
ENV NODE_OPTIONS="--max-old-space-size=1024"

CMD ["tsx", "runner.ts"]
