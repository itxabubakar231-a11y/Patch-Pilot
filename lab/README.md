# PatchPilot Lab Environment

The `lab/` directory provides an isolated local testbed simulating a self-hosted PHP web application.

## Purpose
- Strictly local test target (`127.0.0.1:8081`).
- Port 8080 is reserved for the future PatchPilot reverse proxy.
- Allows testing defensive monitoring, headers inspection, and health auditing without connecting to any external network or remote systems.

## Running the Dummy Server
No extra dependencies are required; it uses Python's standard library.

```bash
# From the project root or lab/ directory
py lab/server.py
# or
python lab/server.py
```

- Endpoint: `http://127.0.0.1:8081/`
- Health check: `http://127.0.0.1:8081/health`

