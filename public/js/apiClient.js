async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        credentials: 'same-origin',
        ...options
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'A apărut o eroare.');
    }

    return data;
}

export const authApi = {
    me() {
        return requestJson('/api/auth/me');
    },

    register({ username, email, password }) {
        return requestJson('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
    },

    login({ email, password }) {
        return requestJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    },

    logout() {
        return requestJson('/api/auth/logout', {
            method: 'POST',
            body: JSON.stringify({})
        });
    }
};

export const accountApi = {
    summary() {
        return requestJson('/api/account/summary');
    },

    updateProfile({ username, currentPassword }) {
        return requestJson('/api/account/profile', {
            method: 'PATCH',
            body: JSON.stringify({ username, currentPassword })
        });
    },

    updatePassword({ currentPassword, newPassword }) {
        return requestJson('/api/account/password', {
            method: 'PATCH',
            body: JSON.stringify({ currentPassword, newPassword })
        });
    },

    logoutAll() {
        return requestJson('/api/account/logout-all', {
            method: 'POST',
            body: JSON.stringify({})
        });
    }
};
