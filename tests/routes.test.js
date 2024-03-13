/* eslint-disable mocha/no-skipped-tests */
/* eslint-disable mocha/no-setup-in-describe */
// test for API endpoints
import { expect } from 'chai';
import request from 'request';
import { MongoClient } from 'mongodb';
import sha1 from 'sha1';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const dbName = process.env.DB_DATABASE || 'files_manager';
const url = `mongodb://${host}:${port}`;

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

    // insert user in users db to test email duplicate
    await testDb.collection('users')
      .insertOne({ email: 'menelik@adwa.com' });
    // to avoid error when running test again (used to create new user)
    await testDb.collection('users')
      .deleteOne({ email: 'tayitu@adwa.com' });
    // no. of users & files
    usersCount = await testDb.collection('users').countDocuments();
    filesCount = await testDb.collection('files').countDocuments();
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
            expect(user.password).to.equal(hashedPassword);
            done();
          }
        },
      );
    });
  });
});
