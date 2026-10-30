# Release notes (English)

GitHub releases for this fork are published in **English**, one file per version:
`release-notes/vX.Y.Z.md` is the exact text of the release body.

`CHANGELOG.md` stays in Portuguese because it is the upstream file shown inside the app
(Settings › About › What changed), and upstream writes it in pt-BR.

Publishing a version:

```bash
# 1) write the English notes: release-notes/vX.Y.Z.md
# 2) commit them, tag, and publish
git tag -a vX.Y.Z -m "Habblaud vX.Y.Z"
git push origin main --tags
gh release create vX.Y.Z --repo ChiepChiep0710/agent-adventure --verify-tag \
  --title "Habblaud vX.Y.Z" --notes-file release-notes/vX.Y.Z.md
```

Editing an already published release:

```bash
gh release edit vX.Y.Z --repo ChiepChiep0710/agent-adventure --notes-file release-notes/vX.Y.Z.md
```

Do **not** use `npm run release` in this fork: it takes the notes from `CHANGELOG.md` (Portuguese).
