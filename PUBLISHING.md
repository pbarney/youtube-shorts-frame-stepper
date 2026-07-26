# Publishing the documentation with GitHub Pages

This package assumes the extension repository will be named:

`youtube-shorts-frame-stepper`

That produces the project site URL:

`https://pbarney.github.io/youtube-shorts-frame-stepper/`

The page currently links back to:

`https://github.com/pbarney/youtube-shorts-frame-stepper`

If you choose another repository name, replace those links in `docs/index.html`.

## Add the files to the extension repository

Copy the included `docs` directory into the root of the repository, alongside files such as `manifest.json` and `content.js`:

```text
youtube-shorts-frame-stepper/
├── manifest.json
├── content.js
└── docs/
    ├── .nojekyll
    ├── index.html
    └── assets/
        └── frame-stepper-icon.svg
```

Commit and push the new directory:

```bash
git add docs
git commit -m "Add GitHub Pages documentation"
git push
```

## Enable GitHub Pages

1. Open the repository on GitHub.
2. Select **Settings**.
3. In the left sidebar, select **Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Select the `main` branch.
6. Select the `/docs` folder.
7. Choose **Save**.

GitHub will publish the site at:

`https://pbarney.github.io/youtube-shorts-frame-stepper/`

The deployment status appears on the repository's **Actions** tab and in **Settings → Pages**.

## Add the site to the AMO listing

In the add-on's AMO developer page, enter this as the add-on website:

`https://pbarney.github.io/youtube-shorts-frame-stepper/`

Use the same URL in the extension manifest's `homepage_url` field if you want the project page exposed through browser extension details:

```json
"homepage_url": "https://pbarney.github.io/youtube-shorts-frame-stepper/"
```

## Updating the page

Edit `docs/index.html`, commit the change, and push it to `main`. GitHub Pages will deploy the updated version automatically.
