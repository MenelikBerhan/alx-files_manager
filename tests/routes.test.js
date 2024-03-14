/* eslint-disable mocha/no-skipped-tests */
/* eslint-disable mocha/no-setup-in-describe */
// test for API endpoints
import { expect } from 'chai';
import request from 'request';
import { MongoClient, ObjectId } from 'mongodb';
import sha1 from 'sha1';
import { v4 as uuid4 } from 'uuid';
import redisClient from '../utils/redis';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const dbName = process.env.DB_DATABASE || 'files_manager';
const mongoUrl = `mongodb://${host}:${port}`;

// used to make asynchronous post
// function asyncRequestPost(url, headers, body) {
//   return new Promise(function (resolve, reject) {
//     request.post({
//       url,
//       headers,
//       body,
//     }, function (error, res, body) {
//       if (!error) {
//         resolve(body);
//       } else {
//         reject(error);
//       }
//     });
//   });
// }

describe('API endpoints', function () {
  let testDbClient;
  let testDb;
  let usersCount;
  let filesCount;

  let user; // to be used for the whole test
  const userTokenForDisconnect = uuid4(); // deleted after /disconnect test
  const userToken = uuid4(); // persistent through the whole test

  before(async function () {
    testDbClient = new MongoClient(mongoUrl, { useUnifiedTopology: true });
    await testDbClient.connect();
    testDb = testDbClient.db(dbName);

    // insert user in users db to test email duplicate
    await testDb.collection('users').insertOne({ email: 'menelik@adwa.com' });

    const userId = new ObjectId();
    const insertObj = {
      email: 'minilik@adwa.com', password: sha1('menelik123'), _id: userId,
    };

    // insert user in db (persistent through the whole test)
    await testDb.collection('users').insertOne(insertObj);
    user = {
      id: userId.toString(), email: 'minilik@adwa.com', password: sha1('menelik123'),
    };

    // insert token in redis
    await redisClient.set(`auth_${userTokenForDisconnect}`, userId.toString(), 3000);
    await redisClient.set(`auth_${userToken}`, userId.toString(), 3000);

    // save initial no. of users & files
    usersCount = await testDb.collection('users').countDocuments();
    filesCount = await testDb.collection('files').countDocuments();
  });

  after(async function () {
    // remove test inserts into db & redis
    await testDb.collection('users').deleteOne({ email: 'tayitu@adwa.com' }); // inserted in POST /users
    await testDb.collection('users').deleteOne({ email: 'menelik@adwa.com' });
    await testDb.collection('users').deleteOne({ email: 'minilik@adwa.com' });

    await redisClient.del(`auth_${userTokenForDisconnect}`);
    await redisClient.del(`auth_${userToken}`);
  });

  describe('GET /status', function () {
    it('Should return correct message & code', function (done) {
      request.get('http://localhost:5000/status', (err, res, body) => {
        if (err) done(err);
        else {
          const expectedData = { redis: true, db: true };
          expect(res.statusCode, 'Status code should be 200').to.equal(200);
          expect(JSON.parse(body), 'Right message returned').to.eql(expectedData);
          done();
        }
      });
    });
  });

  describe('GET /stats', function () {
    it('Should return correct message & code', function (done) {
      request.get('http://localhost:5000/stats', (err, res, body) => {
        if (err) done(err);
        else {
          const expectedData = { users: usersCount, files: filesCount };
          expect(res.statusCode, 'Status code should be 200').to.equal(200);
          expect(JSON.parse(body), 'Right message returned').to.eql(expectedData);
          done();
        }
      });
    });
  });

  describe('POST /users', function () {
    it('Return error when email is missing', function (done) {
      request.post(
        {
          url: 'http://localhost:5000/users',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Menelik' }),
        }, (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(400);
            expect(JSON.parse(body).error).to.equal('Missing email');
            done();
          }
        },
      );
    });

    it('Return error when password is missing', function (done) {
      request.post(
        {
          url: 'http://localhost:5000/users',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'Menelik@a.com' }),
        }, (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(400);
            expect(JSON.parse(body).error).to.equal('Missing password');
            done();
          }
        },
      );
    });

    it('Return error when given email already exists in db.', function (done) {
      request.post(
        {
          url: 'http://localhost:5000/users',
          headers: { 'content-type': 'application/json' },
          // email already exist in db
          body: JSON.stringify({ email: 'menelik@adwa.com', password: 'abc' }),
        }, (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(400);
            expect(JSON.parse(body).error).to.equal('Already exist');
            done();
          }
        },
      );
    });

    it('Saves user in db and respond with correct attributes', function (done) {
      request.post(
        {
          url: 'http://localhost:5000/users',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'tayitu@adwa.com', password: 'menelik123' }),
        }, async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(201);
            const { email: responseEmail, id: responseId } = JSON.parse(body);
            expect(responseEmail).to.equal('tayitu@adwa.com');
            expect(responseId.length).to.equal(24);
            const user = await testDb.collection('users').findOne({ email: responseEmail });
            expect(user._id.toString()).to.equal(responseId);
            const hashedPassword = sha1('menelik123');
            expect(user.password).to.equal(hashedPassword);
            done();
          }
        },
      );
    });
  });

  describe('/connect, /disconnect & /getMe', function () {
    it('POST /connect: Returns error when user is not found.', function (done) {
      const fakeAuthHeader = Buffer.from('abc:abc').toString('base64');
      request.get(
        {
          url: 'http://localhost:5000/connect',
          headers: { Authorization: `Basic ${fakeAuthHeader}` },
        }, async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(401);
            expect(JSON.parse(body).error).to.equal('Unauthorized');
            done();
          }
        },
      );
    });

    it('POST /connect: Returns token & save user id in redis.', function (done) {
      const base64Auth = Buffer.from('minilik@adwa.com:menelik123').toString('base64');
      request.get(
        {
          url: 'http://localhost:5000/connect',
          headers: { Authorization: `Basic ${base64Auth}` },
        }, async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(200);
            const { token } = JSON.parse(body);
            expect(token.length).to.equal(36);
            const userIdFromRedis = await redisClient.get(`auth_${token}`);
            expect(user.id).to.equal(userIdFromRedis);
            done();
          }
        },
      );
    });

    it('POST /disconnect: Returns error when user is not found.', function (done) {
      const fakeAuthHeader = Buffer.from('abc:abc').toString('base64');
      request.get(
        {
          url: 'http://localhost:5000/disconnect',
          headers: { 'X-Token': `Basic ${fakeAuthHeader}` },
        }, async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(401);
            expect(JSON.parse(body).error).to.equal('Unauthorized');
            done();
          }
        },
      );
    });

    it('POST /disconnect: delete the token in Redis and return nothing ', function (done) {
      request.get(
        {
          url: 'http://localhost:5000/disconnect',
          headers: { 'X-Token': userTokenForDisconnect },
        }, async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(204);
            expect(body.length).to.equal(0);
            const redisValue = await redisClient.get(`auth_${userTokenForDisconnect}`);
            expect(redisValue).to.equal(null);
            done();
          }
        },
      );
    });

    it('GET /users/me: returns error when either X-Token or user is not found.', function (done) {
      request.get(
        {
          url: 'http://localhost:5000/users/me',
          headers: { 'X-Token': 'fakeXtoken' },
        }, async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(401);
            expect(JSON.parse(body).error).to.eql('Unauthorized');
            done();
          }
        },
      );
    });

    it('GET /users/me: returns user when valid X-Token is passed.', function (done) {
      request.get(
        {
          url: 'http://localhost:5000/users/me',
          headers: { 'X-Token': userToken },
        }, async (err, res, body) => {
          if (err) done(err);
          else {
            const expectedData = { email: user.email, id: user.id };
            expect(res.statusCode).to.equal(200);
            expect(JSON.parse(body)).to.eql(expectedData);
            done();
          }
        },
      );
    });
  });

  describe('POST /files', function () {
    const url = 'http://localhost:5000/files';
    const headers = { 'content-type': 'application/json', 'X-Token': userToken };
    const folderId = (new ObjectId()).toString();
    const fileId = (new ObjectId()).toString();

    before(async function () {
      // insert a file & folder file in db
      await testDb.collection('files')
        .insertMany([{
          _id: new ObjectId(folderId),
          userId: user.id,
          name: 'images',
          type: 'folder',
          isPublic: false,
          parentId: 0,
        }, {
          _id: new ObjectId(fileId),
          userId: user.id,
          name: 'testfile.txt',
          type: 'file',
          isPublic: false,
          parentId: 0,
        }]);
    });

    after(async function () {
      // remove inserted files in test
      await testDb.collection('files').deleteOne({ _id: new ObjectId(folderId) });
      await testDb.collection('files').deleteOne({ _id: new ObjectId(fileId) });
      await testDb.collection('files').deleteOne({ name: 'music' }); // created in POST /files
    });

    it('If the name is missing, return an error', function (done) {
      request.post({ url, headers, body: JSON.stringify({}) }, async (err, res, body) => {
        if (err) done(err);
        else {
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(body).error).to.equal('Missing name');
          done();
        }
      });
    });

    it('If the type is missing, return an error', function (done) {
      request.post({ url, headers, body: JSON.stringify({ name: 'test.txt' }) }, async (err, res, body) => {
        if (err) done(err);
        else {
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(body).error).to.equal('Missing type');
          done();
        }
      });
    });

    it('If the type is not in not `file`, `image` or `folder`, return an error', function (done) {
      request.post(
        { url, headers, body: JSON.stringify({ name: 'test.txt', type: 'music' }) },
        async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(400);
            expect(JSON.parse(body).error).to.equal('Missing type');
            done();
          }
        },
      );
    });

    it('If the data is missing and type != folder, return an error', function (done) {
      request.post(
        { url, headers, body: JSON.stringify({ name: 'test.txt', type: 'file' }) },
        async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(400);
            expect(JSON.parse(body).error).to.equal('Missing data');
            done();
          }
        },
      );
    });

    it('If no file is present in DB for given parentId, return an error', function (done) {
      request.post(
        { url, headers, body: JSON.stringify({ name: 'test.txt', type: 'folder', parentId: 'fakeId' }) },
        async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(400);
            expect(JSON.parse(body).error).to.equal('Parent not found');
            done();
          }
        },
      );
    });

    it('If type of file for given parentId is not a folder, return an error', function (done) {
      request.post(
        { url, headers, body: JSON.stringify({ name: 'test.txt', type: 'folder', parentId: fileId }) },
        async (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(400);
            expect(JSON.parse(body).error).to.equal('Parent is not a folder');
            done();
          }
        },
      );
    });

    it('For folder, add the new file document in the DB and return the new file', function (done) {
      request.post(
        { url, headers, body: JSON.stringify({ name: 'music', type: 'folder', parentId: folderId }) },
        async (err, res, body) => {
          if (err) done(err);
          else {
            const expectedData = {
              userId: user.id,
              name: 'music',
              type: 'folder',
              isPublic: false,
              parentId: folderId,
            };
            expect(res.statusCode).to.equal(201);
            const respBody = JSON.parse(body);
            const respFileId = respBody.id;
            delete respBody.id;
            expect(respBody).to.eql(expectedData);
            expect(respFileId.length).to.equal(24);
            done();
          }
        },
      );
    });
  });
});
