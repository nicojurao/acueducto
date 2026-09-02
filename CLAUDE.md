# Fluvi — instrucciones para agentes

Ver [README.md](README.md) para arquitectura, módulos, modelo de datos y convenciones completas del proyecto (acueducto comunitario ACBUM, Node/Express/Prisma + React/Vite).

## Agent skills

### Issue tracker

Issues viven en GitHub Issues del repo `nicojurao/acueducto`, gestionados con la CLI `gh`. Ver `docs/agents/issue-tracker.md`.

### Triage labels

Se usan las cinco labels canónicas por defecto: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Ver `docs/agents/triage-labels.md`.

### Domain docs

Layout single-context: `CONTEXT.md` + `docs/adr/` en la raíz (aún no creados; se generan de forma perezosa con `/domain-modeling`). Ver `docs/agents/domain.md`.
