const axios = require("axios").default;
const axiosCookieJarSupport = require("axios-cookiejar-support").default;
const tough = require("tough-cookie");
const fs = require("fs");
const Path = require("path");
const moment = require("moment");
const mkdirp = require("mkdirp");
const { RateLimit } = require("async-sema");
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
const CONCURRENCY = 15;
const LIMITER = RateLimit(CONCURRENCY);

let feedsProcessed = 0;

async function main() {
    try {
        await login();
    } catch (error) {
        console.error("Failed to login to ClassDojo, double check your .env file", error);
        process.exit();
    }

    try {
        await processFeed(FEED_URL);
    } catch (error) {
        console.log("Couldn't get feed", error);
    }
}

async function login() {
    checkEnv("DOJO_EMAIL");
    checkEnv("DOJO_PASSWORD");

    function checkEnv(variable) {
        if (!process.env[variable]) {
            throw new Error(`${variable} not set in the .env file. Please follow the instructions on the README of the project.`);
        }
    }

    return await axios.post(LOGIN_URL, {
        login: process.env.DOJO_EMAIL,
        password: process.env.DOJO_PASSWORD,
        resumeAddClassFlow: false
    });
}

async function getFeed(url) {
    const storyFeed = await axios.get(url);
    return storyFeed.data;
}

async function processFeed(url) {
    const feed = await getFeed(url);

    feedsProcessed++;
    console.log(`found ${feed._items.length} feed items...`);

    for (const item of feed._items) {
        const time = item.time;
        const date = moment(time).format(DATE_FORMAT);
        
        const contents = item.contents;
        const attachments = contents.attachments;

        if (attachments === undefined || attachments.length == 0) {
            //No files to download
            continue;
        }
        await createDirectory(Path.resolve(__dirname, IMAGE_DIR, date));

        for (const attachment of attachments) {
            const url = attachment.path;
            const filename = getFilePath(date, url.substring(url.lastIndexOf("/") + 1));

            await LIMITER();
            downloadFileIfNotExists(url, filename);
        }
    }

    console.log("-----------------------------------------------------------------------");
    console.log(`finished processing feed, feedsProcessed = ${feedsProcessed} / ${MAX_FEEDS}`);
    console.log("-----------------------------------------------------------------------");
    if (feedsProcessed < MAX_FEEDS && feed._links && feed._links.prev && feed._links.prev.href) {
        const previousLink = feed._links.prev.href;
        console.log(`found previous link ${previousLink}`);

        try {
            await processFeed(previousLink);
        } catch (error) {
            console.error("Couldn't get feed", error);
        }
    }
}

async function createDirectory(path) {
    return new Promise((resolve, reject) => {
        mkdirp.sync(path);
        resolve();
    });
}

async function downloadFileIfNotExists(url, filePath) {
    const exists = await fileExists(filePath);
    console.log(`file ${filePath} exists = ${exists}`);
    if (!exists) {
        try {
            await downloadFile(url, filePath);
        } catch (error) {
            console.error("Failed to download file ", url);
        }
    }
}

async function fileExists(filePath) {
    return new Promise((resolve, reject) => {
        try {
            fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
            resolve(true);
        } catch (err) {
            resolve(false);
        }
    });
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
        writer.on("finish", () => {
            console.log(`finished downloading ${filePath}`);
            resolve();
        })
        writer.on("error", reject)
    });
}

main();
