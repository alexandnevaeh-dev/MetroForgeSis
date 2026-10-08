# Authored animation gallery thumbnails

Source animation cards now display their first authored region instead of the legacy primary strip. The virtualized card reads only one source image, checks actual image bounds, and draws nearest-neighbor pixels onto a bounded canvas. Invalid metadata or missing sources produce readable unavailable text; selection still opens the inspector and its recovery controls.

Artifact maturity/provider labels remain unchanged. These previews do not admit draft art into production or change gameplay.

Validation evidence: `E:/MetroForgeData/Development/animation-source-thumbnail-20261007`.

- Desktop native build passed (`build.log`).
- Actual Electron gallery passed 16 checks (`ui-v1/proof.json`), including source card pixels, bounded canvas, Placeholder maturity, invalid-source rejection, frame stepping, keyboard seeking, one-shot replay, missing-source recovery, narrow layout, preserved gameplay/source hashes and no renderer exceptions.
- Wide and narrow PNG captures retained; wide layout inspected.
- Canonical Git index remained SHA256 `0803C77A5996B93D6E975DFA41AB9CEB9E7F078881FAF88BCF265D7AF7FB3918`.

Game art quality, complete animation families and engine gameplay acceptance remain separate work. The reviewed eight-file change was uploaded to the development branch at `611bf3f016bef0a953d094d4a2b4abad261e5c2f`; the remote commit, unchanged main and canonical index were verified. Receipt: `E:/MetroForgeData/GitHubUpload/20261007/source-thumbnail-v1/publication.json`.
