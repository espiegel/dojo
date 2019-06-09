# Dojo

### Purpose
This is a script that retrieves classdojo images since they don't offer a feature to download images from your story feed.

### Run instructions
1. Create a `.env` file in the root of your project that has the following (with curly braces omitted):
```
DOJO_EMAIL={YOUR_EMAIL_THAT_YOU_USE_TO_LOGIN_TO_CLASSDOJO}
DOJO_PASSWORD={YOUR_PASSWORD_THAT_YOU_USE_TO_LOGIN_TO_CLASSDOJO}
```

2. `npm install`

3. `npm start`

Any assets that are scraped will go in an `images/` directory