import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

export const fetchUserModules = async (token: string) => {
    try {
        const response = await api.get('/user/modules/', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        return response;
    } catch (error) {
        console.error('Error fetching modules:', error);
        throw error;
    }
}

export const googleLogin = async (token: string) => {
    try {
        const response = await api.post('/auth/google/', {
            token: token
        });
        return response;
    } catch (error) {
        console.error('Error logging in with Google:', error);
        throw error;
    }
}

export const manualLogin = async (username: string, password: string) => {
    try {
        const response = await api.post('/auth/manual/', {
            username: username,
            password: password
        });
        return response;
    } catch (error) {
        console.error('Error with manual login:', error);
        throw error;
    }
}

export const fetchUserMenuAccess = async (token: string) => {
    try {
        const response = await api.get('/user/menu-access/', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        return response;
    } catch (error) {
        console.error('Error fetching menu access:', error);
        throw error;
    }
}

export const impersonateUser = async (token: string, email: string) => {
    try {
        const response = await api.post('/auth/impersonate/', { email }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        return response;
    } catch (error) {
        console.error('Error impersonating user:', error);
        throw error;
    }
}

// ─── EORDERWEB User Management APIs ───────────────────────────────────────────

export const fetchEOrderUsers = async (token: string, q?: string) => {
    const response = await api.get('/eorder-users/', {
        params: { q },
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const importEOrderUsersCsv = async (token: string, fileOrContent: File | string) => {
    if (typeof fileOrContent === 'string') {
        const response = await api.post('/eorder-users/import-csv/', { content: fileOrContent }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else {
        const formData = new FormData();
        formData.append('file', fileOrContent);
        const response = await api.post('/eorder-users/import-csv/', formData, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    }
};

export const createEOrderUser = async (token: string, data: any) => {
    const response = await api.post('/eorder-users/create/', data, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const updateEOrderUser = async (token: string, userId: number, data: any) => {
    const response = await api.put(`/eorder-users/${userId}/`, data, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const deleteEOrderUser = async (token: string, userId: number) => {
    const response = await api.delete(`/eorder-users/${userId}/`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const fetchEOrderDistributors = async (token: string, q?: string) => {
    const response = await api.get('/eorder-users/distributors/', {
        params: { q },
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const fetchEOrderImportLogs = async (token: string) => {
    const response = await api.get('/eorder-users/logs/', {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const fetchEOrderImportLogDetail = async (token: string, filename: string) => {
    const response = await api.get(`/eorder-users/logs/${filename}/`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const changePassword = async (token: string, data: { old_password: string; new_password: string; confirm_password: string }) => {
    const response = await api.post('/user/change-password/', data, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};