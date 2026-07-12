class PublicError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "PublicError";
    this.statusCode = statusCode;
    this.isPublic = true;
  }
}

module.exports = { PublicError };
