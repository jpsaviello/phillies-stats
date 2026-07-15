# This is a fun personal project for creating a stats site for the Phillies. I use it for batting and pitching stats, schedule and upcoming game odds. The app is running locally in multiple containers on a single node kubernetes cluster. Leveraging Claude code to develop this.

<img width="1686" height="1002" alt="image" src="https://github.com/user-attachments/assets/0f62af44-dad8-4b2e-b56a-273650de7c74" />


# Monitoring
The services are currently monitored using Prometheus and Grafana locally
<img width="1677" height="977" alt="image" src="https://github.com/user-attachments/assets/676a5926-06a2-4159-be96-43b003284404" />



# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
