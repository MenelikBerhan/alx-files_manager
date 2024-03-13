// test for db client
import { expect } from 'chai';
import { MongoClient } from 'mongodb';
import dbClient from '../utils/db';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const dbName = process.env.DB_DATABASE || 'files_manager';
const url = `mongodb://${host}:${port}`;

describe('dbClient', function () {
  let testDbClient;
  let testDb;
  let initialFileCount = 0;
  let initialUserCount = 0;
  before(async function () {
    testDbClient = new MongoClient(url, { useUnifiedTopology: true });
    await testDbClient.connect();
    testDb = testDbClient.db(dbName);
    initialFileCount = await testDb.collection('files').countDocuments();
    initialUserCount = await testDb.collection('users').countDocuments();
  });

  it('Is alive', function () {
    expect(dbClient.isAlive()).to.be.true;
  });

  it('Correctly returns number of users and files in db.', async function () {
    // before saving new users & files in test
    expect(await dbClient.nbFiles()).to.equal(initialFileCount);
    expect(await dbClient.nbUsers()).to.equal(initialUserCount);
    await testDb.collection('files').insertOne({ name: 'test file' });
    await testDb.collection('users').insertOne({ name: 'test user' });
    // after saving new users & files in test
    expect(await dbClient.nbFiles()).to.equal(initialFileCount + 1);
    expect(await dbClient.nbUsers()).to.equal(initialUserCount + 1);
  });
});
