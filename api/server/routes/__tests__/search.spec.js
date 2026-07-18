const express = require('express');
const request = require('supertest');

const mockHealth = jest.fn();
const mockIsAtlasSearchAvailable = jest.fn();

jest.mock('@librechat/api', () => ({
  isEnabled: (value) => value?.trim().toLowerCase() === 'true',
}));

jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn(() => ({ health: mockHealth })),
}));

jest.mock('~/models', () => ({
  isAtlasSearchAvailable: mockIsAtlasSearchAvailable,
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());

describe('search availability route', () => {
  const originalEnv = process.env;
  let app;

  beforeAll(() => {
    const searchRouter = require('../search');
    app = express();
    app.use('/api/search', searchRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, SEARCH: 'true' };
    delete process.env.ATLAS_SEARCH;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns false when search is disabled', async () => {
    process.env.SEARCH = 'false';

    const response = await request(app).get('/api/search/enable');

    expect(response.body).toBe(false);
    expect(mockIsAtlasSearchAvailable).not.toHaveBeenCalled();
    expect(mockHealth).not.toHaveBeenCalled();
  });

  it('checks both Atlas indexes when Atlas Search is enabled', async () => {
    process.env.ATLAS_SEARCH = 'true';
    mockIsAtlasSearchAvailable.mockResolvedValue(true);

    const response = await request(app).get('/api/search/enable');

    expect(response.body).toBe(true);
    expect(mockIsAtlasSearchAvailable).toHaveBeenCalledTimes(1);
    expect(mockHealth).not.toHaveBeenCalled();
  });

  it('retains the Meilisearch health check by default', async () => {
    mockHealth.mockResolvedValue({ status: 'available' });

    const response = await request(app).get('/api/search/enable');

    expect(response.body).toBe(true);
    expect(mockHealth).toHaveBeenCalledTimes(1);
  });

  it('returns false when the configured search provider check fails', async () => {
    process.env.ATLAS_SEARCH = 'true';
    mockIsAtlasSearchAvailable.mockRejectedValue(new Error('not supported'));

    const response = await request(app).get('/api/search/enable');

    expect(response.body).toBe(false);
  });
});
