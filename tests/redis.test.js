// test for redis client
import { expect } from 'chai';
import redisClient from '../utils/redis';

describe('redisClient', function () {
  // function used to set time out of x seconds
  const fn = async (x) => new Promise((resolve) => {
    setTimeout(resolve, x * 1000);
  });

  it('Is alive', function () {
    expect(redisClient.isAlive()).to.be.true;
  });

  it('Saves keys with expiration time & retrieves them correctly.', async function () {
    await redisClient.set('a', 1, 1); // expiry time of 1 second
    await redisClient.set('b', 2, 5);
    await fn(1);
    expect(await redisClient.get('a')).to.equal(null); // expired key
    expect(await redisClient.get('b')).to.equal('2');
  });

  it('Deletes keys.', async function () {
    await redisClient.set('c', 3, 5);
    expect(await redisClient.get('c')).to.equal('3');
    await redisClient.del('c');
    expect(await redisClient.get('c')).to.equal(null);
  });
});
