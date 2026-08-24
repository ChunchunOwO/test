# SDK migration policy

There is no migration required for SDK `1.0.0`.

When a future SDK version is released:

1. compare `echo-workshop-sdk.json` before changing project files;
2. keep the current `schemaVersion` and `pluginApiVersion` until the new versions are listed as supported;
3. update one version field at a time;
4. run the portable SDK `sync` and `validate` commands;
5. run ECHO's production `workshop:author -- validate` command;
6. test subscribe, download, use and disable with an ordinary Steam account before changing the public item.

ECHO will not infer a newer API from SDK package version. Compatibility is declared explicitly in `echo.workshop.json`.
