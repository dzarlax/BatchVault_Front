# Security Policy

## Critical Security Rules

### 1. NEVER Commit Secrets
**CRITICAL:** Never commit the following to version control:
- JWT secrets/tokens
- Database connection strings with passwords
- API keys (Mapbox, payment processors, etc.)
- Passwords (any kind)
- Private certificates/keys

### 2. Environment Variables Management

**Development:**
- Copy `.env.example` to `.env`
- Fill in actual values
- `.env` is in `.gitignore` and will NOT be committed

**Production:**
- Use environment variables in Docker Compose: `${VARIABLE_NAME}`
- Store actual values in secure secret management system
- Never put production secrets in `docker-compose.yaml`

### 3. Docker Compose Security

**❌ WRONG (committing secrets):**
```yaml
environment:
  JWT_SECRET: my hardcoded secret
  DATABASE_URL: postgresql://user:pass@host/db
```

**✅ CORRECT (using env vars):**
```yaml
environment:
  JWT_SECRET: ${JWT_SECRET}
  DATABASE_URL: ${DATABASE_URL}
```

Then create `.env` file (not committed):
```
JWT_SECRET=your_secure_random_string
DATABASE_URL=postgresql://...
```

### 4. Immediate Actions Required

If you find any secrets in the repository:
1. **Revoke/rotate** the compromised credentials immediately
2. **Remove** from git history: `git filter-branch` or `git filter-repo`
3. **Generate** new secrets
4. **Update** `.env.example` with placeholders only

### 5. Current Security Issues

**FRONTEND** (BatchVault_Front):
- ❌ Mapbox token exposed in docker-compose.yaml
- ✅ Fixed: Use `${MAPBOX_ACCESS_TOKEN}` instead

**BACKEND** (BatchVault_Back):
- ❌ JWT_SECRET exposed in docker-compose.yaml
- ❌ DATABASE_URL with credentials exposed in docker-compose.yaml
- ✅ Fixed: Create `.env` file with these values

## Reporting Security Issues

If you discover a security vulnerability, please:
- Do NOT open a public issue
- Contact maintainers directly
- Include details and reproduction steps

## Best Practices

1. **Use Strong Secrets:**
   - JWT_SECRET: Minimum 16 characters, preferably 32+
   - Use: `openssl rand -base64 32` or similar

2. **Regular Rotation:**
   - Rotate JWT secrets periodically
   - Rotate database passwords
   - Rotate API keys

3. **Principle of Least Privilege:**
   - Database user should only have necessary permissions
   - Don't use root/superuser accounts

4. **HTTPS in Production:**
   - Always use HTTPS for API communication
   - Validate SSL certificates

5. **Dependency Updates:**
   - Keep dependencies updated
   - Run `npm audit` regularly
   - Monitor security advisories
