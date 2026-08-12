import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "cpc_access_token";
export const redirectUri = AuthSession.makeRedirectUri({ scheme: "cpc", path: "auth" });

console.log("Redirect URI:", redirectUri);

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export const readToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

export async function exchangeAuthorizationCode(response, request, discovered) {
  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId: process.env.EXPO_PUBLIC_ZITADEL_CLIENT_ID,
      code: response.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier },
    },
    discovered
  );
  await saveToken(token.accessToken);
  return token.accessToken;
}
