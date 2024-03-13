// worker and processor for bull queue handling image files
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

const fs = require('fs').promises;

const imageThumbnail = require('image-thumbnail');
const Bull = require('bull');

// create a consumer queue named fileQueue. Jobs will have userId & fileId
const fileQueue = new Bull('fileQueue');

// generate 3 thumbnails with width = 500, 250 and 100, then store each
// result on the same location of the original file by appending _<width size>
fileQueue.process(async (job, done) => {
  // get job data
  const { userId, fileId } = job.data;

  // check if fileId & userId exist for each job. If not raise error.
  if (!job.data.fileId) {
    done(new Error('Missing fileId'));
    return;
  }
  if (!job.data.userId) {
    done(new Error('Missing userId'));
    return;
  }

  // retrieve document from db. If absent raise error.
  const document = await dbClient.db.collection('files')
    .findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });
  if (!document) {
    done(new Error('File not found'));
    return;
  }

  // notify start of job
  console.log(`Started Job for jobID:${job.id}, fileId:${fileId}, userId:${userId}`);

  // create three thumb nails of width [500, 250, 100]
  const filePath = document.localPath;
  let created = 0;
  [500, 250, 100].forEach(async (width) => {
    await imageThumbnail(filePath, { width })
      .then(async (data) => {
        const thumbNailPath = `${filePath}_${width}`;
        await fs.writeFile(thumbNailPath, data); // write thumbnail to file
        return console.log(`Created ${thumbNailPath}`);
      })
      .then(() => {
        created += 1;
        if (created === 3) { // all thumbnails created. Job done.
          console.log(`Finished creating thumbnails for ${filePath}`);
          done();
        }
      })
      .catch((err) => { done(err); });
  });
});

// create a consumer queue named userQueue. Jobs will have userId
const userQueue = new Bull('userQueue');

// Prints Welcome <email>! for newly created user
userQueue.process(async (job, done) => {
  const { userId } = job.data;
  if (!userId) {
    done(new Error('Missing userId'));
  }

  // get user from db
  const user = await dbClient.db.collection('users')
    .findOne({ _id: new ObjectId(userId) });
  if (!user) {
    done(new Error('User not found'));
  }
  console.log(`Welcome ${user.email}`);
  done();
});
