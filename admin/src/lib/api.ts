import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh access token on 401 once, then retry the original request
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error?.config as any;
    const status = error?.response?.status;
    const url: string = original?.url || "";
    if (
      status === 401 &&
      !original?.__isRetryRequest &&
      typeof window !== "undefined" &&
      !url.includes("/api/auth/login") &&
      !url.includes("/api/auth/register") &&
      !url.includes("/api/auth/refresh")
    ) {
      try {
        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken) throw new Error("No refresh token");
        const { data } = await api.post("/api/auth/refresh", { refreshToken });
        if (data?.accessToken && data?.refreshToken) {
          localStorage.setItem("accessToken", data.accessToken);
          localStorage.setItem("refreshToken", data.refreshToken);
          // mark to avoid infinite loop
          original.__isRetryRequest = true;
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        }
      } catch (e) {
        // Refresh failed: clear tokens and redirect to login to avoid "Invalid token" noise in UI
        try {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
        } catch {}
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
