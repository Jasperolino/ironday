# Ironday Gym Tracker

A gym tracker that helps people who are new to the gym build a routine and keep it.

- **Weekly split:** choose what you train each day (for example Monday: Shoulders & Triceps), with exercises, sets, reps and a reminder time.
- **Workout logging:** weight and reps for every set, a rest timer, "last time" hints and personal bests.
- **Nutrition:** calories, protein, carbs and fat per meal, a quick-add food list, custom foods and a water tracker.
- **Goals:** body weight, lift targets, workouts per week, a weight trend chart and badges.
- **Smart reminders:** workout time, streak at risk, low protein, water, goal milestones and a preview of tomorrow.
- **Google account:** sign in with Google. Each user's data is private.
- **Google Sheets:** optional sync to a spreadsheet in the user's own Google Drive.
- **Works on phones:** install it on Android and iPhone from the browser. It also works offline.

It's a static web app (HTML, CSS and JavaScript, with no build step). It uses Firebase for sign-in and storage, and GitHub Pages for hosting. All of these are free for a project this size.

---

## How user data is kept private

- Users sign in with **Google** through Firebase Authentication.
- Each user's data is one Firestore document at `users/{their user id}`.
- [`firestore.rules`](firestore.rules) only lets a signed-in user read or write **their own** document. The database refuses every other request, so one user can't see or change another user's data.
- Google Sheets sync uses the user's own Google sign-in with the `drive.file` permission. Ironday can only open spreadsheets it created for that user, never the rest of their Drive.
- The values in `firebase-config.js` are not secrets. They only name your Firebase project. Your data is protected by the rules above and by the list of allowed web addresses (step 3).

---

## Setup (about 15 minutes, one time)

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> and click **Create a project**. Google Analytics is optional.
2. Click the **Web** icon (`</>`) to add a web app. Name it `Ironday`. You don't need Firebase Hosting.
3. Copy the `firebaseConfig` values it shows into [`firebase-config.js`](firebase-config.js).

### 2. Turn on Google sign-in and the database
1. **Build › Authentication › Get started › Sign-in method › Google › Enable.** Choose a support email and save.
2. **Build › Firestore Database › Create database.** Pick a location near your users and start in **production mode**.
3. On the Firestore **Rules** tab, paste the contents of [`firestore.rules`](firestore.rules) and click **Publish**.

### 3. Allow your web address to sign in
Go to **Authentication › Settings › Authorized domains** and add:
- `localhost` (usually already listed)
- `YOUR-GITHUB-USERNAME.github.io`

### 4. Turn on Google Sheets (optional)
1. Open <https://console.cloud.google.com>, choose the same project, and go to **APIs & Services › Library**.
2. Enable the **Google Sheets API**.
3. Go to **APIs & Services › OAuth consent screen**. Fill in the app name and support email, and add the scope `.../auth/drive.file`.
4. While the app is in **Testing**, add each person's Gmail address under **Test users**. Up to 100 testers are allowed. When you're ready for everyone, click **Publish app**. `drive.file` is one of Google's recommended scopes, so publishing normally doesn't need a security review.

### 5. Put it on GitHub Pages
1. Push this folder to a GitHub repository. GitHub Pages is free for public repositories.
2. In the repository, open **Settings › Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` deploys the app with [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Your app's address will be `https://YOUR-GITHUB-USERNAME.github.io/REPOSITORY-NAME/`.

When you change files, raise `VERSION` in [`sw.js`](sw.js) so installed phones download the new version.

---

## Installing on phones

**Android (Chrome):** open the app's address, then tap **Install app**. You can also use the ⋮ menu and choose **Install app** or **Add to Home screen**.

**iPhone / iPad (Safari):** open the app's address, tap **Share**, then **Add to Home Screen**. Notifications on iPhone need iOS 16.4 or later, and the app must be opened from the Home Screen.

### App stores (optional, later)
The installable web app works on both platforms without an app store. If you want store listings, open <https://www.pwabuilder.com>, enter your app's address, and download the packages it builds:
- **Google Play:** a signed Android package. You need a Google Play developer account (one-time $25).
- **Apple App Store:** an Xcode project. You need an Apple Developer account ($99 a year) and a Mac with Xcode (or a cloud Mac service) to build and submit it.

---

## Try it on your computer

You need any static file server. For example, from this folder:

```
python -m http.server 8080
```

Then open <http://localhost:8080>.
- With `firebase-config.js` filled in, you'll see **Continue with Google**.
- Without it, open <http://localhost:8080/?demo> for **preview mode**. Preview mode skips sign-in and saves to that browser only. It only works on `localhost`.

---

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page shell and navigation |
| `styles.css` | Light and dark glass theme |
| `app.js` | The whole app: sign-in, storage, workouts, nutrition, goals, reminders, Settings, Google Sheets |
| `firebase-config.js` | Your Firebase project settings |
| `firestore.rules` | Database rules that keep every user's data private |
| `sw.js` | Offline support and installability |
| `manifest.webmanifest` | App name, icons and colours for the home screen |
| `icons/` | App icons. Regenerate them with `node tools/make-icons.js` |

## Known limits

- Reminders appear while the app is open or running in the background. Reminders when the app is fully closed would need a push server, such as Firebase Cloud Messaging with a scheduled Cloud Function. That isn't set up yet.
- Google limits Sheets access to one hour per connection. After that, Ironday shows **Reconnect**, which takes one tap.
- Workout weights are in kilograms.
