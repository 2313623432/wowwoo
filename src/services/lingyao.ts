import { apiRequest } from "./api";

type WrappedResponse<T> = {
  message: string;
  data: T;
};

export type LingyaoRegisterParams = {
  username: string;
  password: string;
  invite_code: string;
};

export type LingyaoRegisterResult = {
  account: string;
  register_result: {
    message: string;
    success: boolean;
  };
  binding_status: string;
};

export type LingyaoLoginParams = {
  username: string;
  password: string;
};

export type LingyaoLoginResult = {
  account: string;
  base_url: string;
};

export type LingyaoApiKeyInfo = {
  account: string;
  api_key: string;
  base_url: string;
  remote: unknown;
};

export type LingyaoStatusInfo = {
  bound: boolean;
  account: string | null;
  lingyao_user_id: string | null;
  base_url: string | null;
  has_session: boolean;
  api_key_masked: string | null;
};

export type LingyaoRechargeParams = {
  channel: "epay";
  payload: {
    amount: number;
    payment_method: "alipay" | "wxpay";
  };
};

export type LingyaoRechargeForm = Record<
  string,
  string | number | null | undefined
>;

export type LingyaoRechargeResult = {
  data: LingyaoRechargeForm;
  message: string;
  url: string;
};

export async function registerLingyao(
  token: string,
  body: LingyaoRegisterParams,
): Promise<LingyaoRegisterResult> {
  const res = await apiRequest<WrappedResponse<LingyaoRegisterResult>>(
    "/api/v1/users/lingyao/register",
    {
      method: "POST",
      token,
      body: {
        account: body.username,
        username: body.username,
        password: body.password,
        invite_code: body.invite_code,
      },
    },
  );
  return (res?.data ?? ({} as any)) as LingyaoRegisterResult;
}

export async function loginLingyao(
  token: string,
  body: LingyaoLoginParams,
): Promise<LingyaoLoginResult> {
  const res = await apiRequest<WrappedResponse<LingyaoLoginResult>>(
    "/api/v1/users/lingyao/login",
    {
      method: "POST",
      token,
      body: {
        account: body.username,
        username: body.username,
        password: body.password,
      },
    },
  );
  return (res?.data ?? ({} as any)) as LingyaoLoginResult;
}

export async function getLingyaoStatus(
  token: string,
): Promise<LingyaoStatusInfo> {
  return apiRequest<LingyaoStatusInfo>("/api/v1/users/lingyao/status", {
    method: "GET",
    token,
  });
}

export async function getLingyaoApiKey(
  token: string,
): Promise<LingyaoApiKeyInfo> {
  return apiRequest<LingyaoApiKeyInfo>("/api/v1/users/lingyao/api-key", {
    method: "GET",
    token,
  });
}

export async function rechargeLingyao(
  token: string,
  body: LingyaoRechargeParams,
): Promise<LingyaoRechargeResult> {
  const res = await apiRequest<WrappedResponse<LingyaoRechargeResult>>(
    "/api/v1/users/lingyao/recharge",
    {
      method: "POST",
      token,
      body,
    },
  );
  return (res?.data ?? ({} as any)) as LingyaoRechargeResult;
}

export async function unbindLingyao(token: string): Promise<Record<string, any>> {
  return apiRequest<Record<string, any>>("/api/v1/users/lingyao/unbind", {
    method: "POST",
    token,
  });
}

export function buildLingyaoRechargeUrl(
  url: string,
  form: LingyaoRechargeForm,
): string {
  const query = new URLSearchParams();
  Object.entries(form).forEach(([key, value]) => {
    if (value != null) {
      query.append(key, String(value));
    }
  });
  const queryString = query.toString();
  if (!queryString) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
}
