import axios from "axios";

export const createApiClient = (baseURL: string, token?: string) =>
  axios.create({
    baseURL,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
