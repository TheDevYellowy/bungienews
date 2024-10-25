const { AtpAgent } = require("@atproto/api");
const fs = require("node:fs");
require('dotenv').config();
var lastUpdate;

if(!fs.existsSync(`${__dirname}/logs`)) fs.mkdirSync(`${__dirname}/logs`);
const logs = fs.createWriteStream(`${__dirname}/logs/latest.txt`);

const client = new AtpAgent({
  service: "https://bsky.social"
});

client.login({
  identifier: process.env.email,
  password: process.env.password
}).then(async () => {
  logs.write(`Successfully logged in to ${client.session.handle}\n`);
  await getDataAndPost();
  setInterval(async() => {
    await getDataAndPost();
  }, 30000);
});

async function alreadyPosted(url) {
  const { success, data } = await client.getAuthorFeed({ actor: client.did });
  if(success) {
    if(data.feed[0].post.embed.external.uri == url) return true;
    else return false;
  } else return true;
}

async function getDataAndPost() {
  const postRequest = await fetch("https://cdn.contentstack.io/v3/content_types/news_article/entries/?query=%7B%22category%22%3A%7B%22%24regex%22%3A%22community%7Cdestiny%7Cupdates%22%7D%7D&locale=en-us&desc=date&include_count=true&skip=0&limit=10&environment=live", {
    "headers": {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9",
      "access_token": "cs7929311353379d90697fc0b6",
      "api_key": "blte410e3b15535c144",
      "content-type": "application/json; charset=UTF-8",
      "priority": "u=1, i",
      "sec-ch-ua": "\"Chromium\";v=\"130\", \"Google Chrome\";v=\"130\", \"Not?A_Brand\";v=\"99\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      "x-user-agent": "contentstack-web/3.15.0",
      "Referer": "https://www.bungie.net/",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    "body": null,
    "method": "GET"
  });
  const postData = await postRequest.json();
  if(lastUpdate && lastUpdate > new Date(postData.entries[0].created_at).getTime()) return;
  logs.write("Found new post from bungie api\n");
  const latestPost = postData.entries[0];
  lastUpdate = Date.now();

  const imageRequest = await fetch(latestPost.banner_image.url);
  const imageBuffer = await imageRequest.arrayBuffer();
  const imageUint8 = new Uint8Array(imageBuffer);

  const posted = await alreadyPosted(`https://www.bungie.net/7/en/News/article${latestPost.url.hosted_url}`);

  if(posted) {
    logs.write(`The post was already forwarded to Bluesky, exiting function\n`);
    return;
  };

  try {
    logs.write("Attempting to post to bluesky\n");
    const { data } = await client.uploadBlob(imageUint8);
    const { uri, cid } = await client.post({
      text: `New post on the bungie.net homepage\n${latestPost.title}`,
      tags: ["bungie", "destiny2", "destinythegame"],
      embed: {
        $type: "app.bsky.embed.external",
        external: {
          uri: `https://www.bungie.net/7/en/News/article${latestPost.url.hosted_url}`,
          title: latestPost.title,
          description: latestPost.subtitle,
          thumb: data.blob
        }
      },
      createdAt: new Date().toISOString()
    });

    await client.like(uri, cid);

    logs.write(`Created post at ${new Date(lastUpdate).toString()}`);
  } catch (error) {
    logs.write(`There was an error posting the news: ${error}`);
    console.error(`There was an error posting the news: ${error}`);
  }
}

process.on("beforeExit", () => {
  logs.close();
  const date = new Date();
  fs.renameSync("./logs/latest.txt", `./logs/${date.getMonth()+1}-${date.getDate()}-${date.getFullYear().toString().slice(2)}.txt`);
});