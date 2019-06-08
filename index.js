const axios = require("axios").default;
const axiosCookieJarSupport = require("axios-cookiejar-support").default;
const tough = require("tough-cookie");
const fs = require("fs");
const Path = require("path");
const moment = require("moment");
const RateLimiter = require("limiter").RateLimiter;
require("dotenv").config()

// install cookie jar
axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();
axios.defaults.jar = cookieJar;
axios.defaults.withCredentials = true;

const LOGIN_URL = "https://home.classdojo.com/api/session";
const FEED_URL = "https://home.classdojo.com/api/storyFeed?includePrivate=true";

const IMAGE_DIR = "images";
const DATE_FORMAT = "YYYY-MM-DD";
const MAX_FEEDS = 30;
const QPS = 15;
const LIMITER = new RateLimiter(QPS, "second");

let feedsProcessed = 0;

async function main() {
    await login();

    const feed = await getFeed(FEED_URL);
    if (feed) {
        await processFeed(feed);
    } else {
        console.log("Couldn't get feed");
    }
}

async function login() {
    return await axios.post(LOGIN_URL, {
        "login": process.env.DOJO_EMAIL,
        "password": process.env.DOJO_PASSWORD,
        "resumeAddClassFlow": false
    });
}

async function getFeed(url) {
    const storyFeed = await axios.get(url);
    return storyFeed.data;
}

async function processFeed(feed) {
    feedsProcessed++;
    console.log("feed items", feed._items.length);
    for (const item of feed._items) {
        const time = item.time;
        const date = moment(time).format(DATE_FORMAT);

        const contents = item.contents;

        const attachments = contents.attachments;
        for (const attachment of attachments) {

            const url = attachment.path;
            await createDirectory(Path.resolve(__dirname, IMAGE_DIR, date));
            const filename = getFilePath(date, url.substring(url.lastIndexOf("/") + 1));

            await downloadFileIfNotExists(url, filename);
        }
    }

    console.log("-----------------------------------------------------------------------");
    console.log(`finished going through feed, feedsProcessed = ${feedsProcessed} / ${MAX_FEEDS}`);
    console.log("-----------------------------------------------------------------------");
    if (feedsProcessed < MAX_FEEDS && feed._links && feed._links.prev && feed._links.prev.href) {
        const previousLink = feed._links.prev.href;
        console.log(`found previous link ${previousLink}`);

        try {
            const feed = await getFeed(previousLink);
            await processFeed(feed);
        } catch (error) {
            console.error("failed to get feed", error);
        }
    }
}

async function createDirectory(path) {
    return fs.promises.mkdir(path, {recursive: true})
        .catch(error => {
            // noop
        });
}

async function downloadFileIfNotExists(url, filePath) {
    const exists = await fileExists(filePath);
    console.log(`file ${filePath} exists = ${exists}`);
    if (!exists) {
        await new Promise((resolve, reject) => {
            LIMITER.removeTokens(1, function(err, remainingRequests) {
                resolve();
            });
        });
        try {
            await downloadFile(url, filePath);
        } catch (error) {
            console.error("Failed to download file ", url, error);
        }
    }
}

async function fileExists(filePath) {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch (error) {
        return false;
    }
}

function getFilePath(date, filename) {
    return Path.resolve(__dirname, IMAGE_DIR, date, filename);
}

async function downloadFile(url, filePath) {
    console.log(`about to download ${filePath}...`)  
    const writer = fs.createWriteStream(filePath);

    const response = await axios.get(url, {
        responseType: "stream"
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on("finish", resolve)
        writer.on("error", reject)
    });
}

main();
