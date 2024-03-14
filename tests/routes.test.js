/* eslint-disable mocha/no-skipped-tests */
/* eslint-disable mocha/no-setup-in-describe */
// test for API endpoints
import { expect } from 'chai';
import request from 'request';
import { MongoClient } from 'mongodb';
import sha1 from 'sha1';
import redisClient from '../utils/redis';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const dbName = process.env.DB_DATABASE || 'files_manager';
const url = `mongodb://${host}:${port}`;

function asyncRequestPost(url, headers, body) {
  return new Promise(function (resolve, reject) {
    request.post({
      url,
      headers,
      body,
    }, function (error, res, body) {
      if (!error) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}

describe('API endpoints', function () {
  let testDbClient;
  let testDb;
  let usersCount;
  let filesCount;
  const hashedPassword = sha1('menelik123');
  before(async function () {
    testDbClient = new MongoClient(url, { useUnifiedTopology: true });
    await testDbClient.connect();
    testDb = testDbClient.db(dbName);
    // to avoid error when running test again (used to create new user)
    await testDb.collection('users')
      .deleteOne({ email: 'tayitu@adwa.com' });
    // insert user in users db to test email duplicate
    await testDb.collection('users')
      .insertOne({ email: 'menelik@adwa.com' });
    // no. of users & files
    usersCount = await testDb.collection('users').countDocuments();
    filesCount = await testDb.collection('files').countDocuments();
  });

  after(async function () {
    await testDb.collection('users')
      .deleteOne({ email: 'tayitu@adwa.com' });
    await testDb.collection('users')
      .deleteOne({ email: 'menelik@adwa.com' });
  });

  describe.skip('GET /status', function () {
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

  describe.skip('GET /stats', function () {
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

  describe.skip('POST /users', function () {
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
            expect(user.password).to.equal(hashedPassword);
            done();
          }
        },
      );
    });
  });

  describe('/connect, /disconnect & /getMe', function () {
    const base64Auth = Buffer.from('minilik@adwa.com:menelik123').toString('base64');
    let user; // to be used for sussessful connect
    const userTokenForDisconnect = 'e30bb704-b6d0-4824-beb3-040f8c38b8af';
    const userTokenForGetUser = 'e30bb704-b6d0-4824-beb3-040f8c38b8ae';

    before(async function () {
      await testDb.collection('users').deleteOne({ email: 'minilik@adwa.com' });

      const url = 'http://localhost:5000/users';
      const headers = { 'content-type': 'application/json' };
      const body = JSON.stringify({ email: 'minilik@adwa.com', password: 'menelik123' });
      const resBody = await asyncRequestPost(url, headers, body);
      user = JSON.parse(resBody);
      await redisClient.set(`auth_${userTokenForDisconnect}`, user.id, 3000);
      await redisClient.set(`auth_${userTokenForGetUser}`, user.id, 3000);
    });
    after(async function () {
      await testDb.collection('users')
        .deleteOne({ email: 'minilik@adwa.com' });
      await redisClient.del(`auth_${userTokenForDisconnect}`);
      await redisClient.del(`auth_${userTokenForGetUser}`);
    });

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
        }, (err, res, body) => {
          if (err) done(err);
          else {
            expect(res.statusCode).to.equal(204);
            expect(body.length).to.equal(0);
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
          headers: { 'X-Token': userTokenForGetUser },
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
});
