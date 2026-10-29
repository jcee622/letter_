# Firebase setup

The app stores each signed-in user's letters in Firestore at
`users/{uid}/letters/{letterId}`. Google sign-in is required to save and sync
letters. Shared recipient links continue to contain the letter contents in the
URL; they do not grant access to the private Firestore collection.

1. In Firebase Console, enable **Authentication → Google**.
2. Create a **Cloud Firestore** database.
3. Publish the rules in `firestore.rules` using the Firestore Rules tab, or
   deploy them with the Firebase CLI.
4. In **Authentication → Settings → Authorized domains**, add the domain used
   to serve this site. For local testing, add `localhost`.
5. Serve the project from a local web server or deploy it to a web host. ES
   modules and Google sign-in do not work reliably from a `file://` URL.

The Firebase web-app config is in `firebase-config.js`. Firebase client config is
included in browser code by design; Firestore access is restricted by the
owner-only rules above.
