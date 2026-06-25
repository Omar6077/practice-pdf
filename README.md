# Practice PDF Booklet Maker — web version

A static browser app that:

* accepts a practice-question PDF;
* adds an optional title page;
* inserts a ruled writing page after every original page;
* supports folded-booklet and ordinary double-sided pairing;
* pads the output to a multiple of four pages when requested; and
* downloads the finished PDF without uploading the source PDF to a server.

## Publish it with GitHub Pages

No command line or build software is required.

1. Sign in to GitHub and create a new repository, for example `practice-pdf-booklet`.
2. Make the repository **Public** if you are using GitHub Free.
3. Extract the supplied ZIP file on your computer.
4. In the new repository, choose **Add file → Upload files**.
5. Drag in **all the contents** of the extracted `practice-pdf-web` folder, including the `.github` folder. Upload the contents, not the outer folder or ZIP.
6. Commit the files to the `main` branch.
7. Open **Settings → Pages**.
8. Under **Build and deployment → Source**, select **GitHub Actions**.
9. Open the repository’s **Actions** tab. The included deployment workflow should run automatically. It can also be started with **Run workflow**.
10. When deployment finishes, use **Settings → Pages → Visit site**.

The address will normally be:

`https://YOUR-USERNAME.github.io/practice-pdf-booklet/`

## 

