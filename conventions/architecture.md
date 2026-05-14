# Architecture

## Overview

FILL: One paragraph. What this system does, who uses it, and how the main pieces fit together.

## Directory Map

```
FILL: Annotated directory tree. Example:

src/
  api/          ← HTTP handlers, route definitions
  services/     ← Business logic, no framework dependencies
  models/       ← Data models and DB schema
  utils/        ← Shared helpers with no side effects

infra/
  docker/       ← Container definitions
  scripts/      ← Deployment and maintenance scripts
```

## Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| FILL | FILL | FILL |

## Data Flow

FILL: How a request or event moves through the system. Use a numbered sequence or simple diagram.

## External Dependencies

| Service | Purpose | Config location |
|---------|---------|-----------------|
| FILL | FILL | FILL |

## What NOT to change without reading context first

FILL: List components or files where an uninformed change would have non-obvious side effects.
