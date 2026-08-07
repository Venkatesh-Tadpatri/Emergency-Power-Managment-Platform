import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";
export function Callback() {
    const auth = useAuth();
    const navigate = useNavigate();
    useEffect(() => {
        if (auth.isAuthenticated) {
            navigate("/", { replace: true });
        }
    }, [auth.isAuthenticated, navigate]);
    if (auth.error) {
        return _jsxs("div", { className: "center-screen", children: ["Sign-in failed: ", auth.error.message] });
    }
    return _jsx("div", { className: "center-screen", children: "Completing sign in..." });
}
