// File systems Client
import path from 'path';

const fs = require('fs').promises;
const { statSync, mkdirSync } = require('fs');

/**
 * File system client that asynchronously handles
 * read and write operations of files on local drive.
 */
class FileSystemClient {
  constructor() {
    // path to directory where all files will be stored
    this.storagePath = process.env.FOLDER_PATH || '/tmp/files_manager';

    this.setUpDone = false;

    /*  Using asynchronous stat & mkdir
    // check if given storage directory exists. If not create one.
    fs.stat(this.storagePath)
      .then((stat) => {
        if (!stat.isDirectory()) { // if path is not for a directory throw error
          const err = new Error('Directory not found at given storage path');
          err.code = 'ENOTDIR'; // not a directory
          throw err;
        }
      })
      .catch((err) => {
        // If error is ENOENT (no such file or directory) or ENOTDIR (not a directory)
        // create a directory at given path. Else re-raise the caught error.
        if (['ENOENT', 'ENOTDIR'].includes(err.code)) {
          return fs.mkdir(this.storagePath)
            .then(() => console.log(`Created storage dir ${this.storagePath}`));
        }
        throw err;
      })
      .then(() => {
        this.setUpDone = true;
        console.log('File system client successfuly started.');
      }); */

    // using Synchronous stat & mkdir
    let createDir;
    // create storage dir if a directory doesn't exist at given path
    try {
      const dirStat = statSync(this.storagePath);
      createDir = !dirStat.isDirectory();
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      createDir = true;
    } finally {
      if (createDir) {
        mkdirSync(this.storagePath);
        console.log(`Created storage dir: '${this.storagePath}'`);
      }
      console.log('File system client successfuly started.');
      this.setUpDone = true;
    }
  }

  /**
   * Checks if the file system client is successfuly set up.
   * @returns {boolean} true is successful, otherwise false.
   */
  isAlive() {
    return this.setUpDone;
  }

  /**
   * Asynchrously retrieves the contents of the file at given path.
   * @param {String} fileName
   * @returns {Promise<Buffer>} Fulfills with a Buffer of the contents of the file.
   */
  // eslint-disable-next-line class-methods-use-this
  async readFile(filePath) {
    // append file name to storage path
    // const filePath = path.join(this.storagePath, fileName);
    //
    return fs.readFile(filePath);
  }

  /**
   * Asynchrously writes data to the file at given path.
   * @param {String} fileName Name of file
   * @param {String} data Base64 encoded data.
   * @returns {Promise<String>} Fulfills with the absolute path to the file save in local.
   */
  async writeFile(fileName, data) {
    // append file name to storage path
    const filePath = path.join(this.storagePath, fileName);
    // create buffer form base64 and write to local storage
    await fs.writeFile(filePath, Buffer.from(data, 'base64'));
    // return the absolute local path to file
    return fs.realpath(filePath);
  }
}

const fsClient = new FileSystemClient();
export default fsClient;
