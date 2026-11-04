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

// EORDERWEB User Management APIs

export type EOrderUserSort = '' | 'last_login_desc' | 'last_login_asc';

export const fetchEOrderUsers = async (token: string, q?: string, sort?: EOrderUserSort) => {
    const response = await api.get('/eorder-users/', {
        params: { q, sort: sort || undefined },
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const exportEOrderUsersExcel = async (token: string, q?: string, sort?: EOrderUserSort) => {
    const response = await api.get('/eorder-users/export-excel/', {
        params: { q, sort: sort || undefined },
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
    });
    return response.data;
};

export const fetchEOrderUserStats = async (token: string, periode: string) => {
    const response = await api.get('/eorder-users/stats/', {
        params: { periode },
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

// STD Area Matrix (RSM & ASM Distributor Mapping) APIs

export interface StdAreaMatrixFilterParams {
    q?: string;
    zone?: string;
    operator?: string;
    mapping_type?: string;
}

export interface StdAreaMatrixEntryPayload {
    zone: string;
    shiptord: string;
    rd_desc?: string;
    operator: 'EQ' | 'EX';
}

export const fetchStdAreaMatrix = async (token: string, params: StdAreaMatrixFilterParams = {}) => {
    const response = await api.get('/std-area-matrix/', {
        params: {
            q: params.q || undefined,
            zone: params.zone || undefined,
            operator: params.operator || undefined,
            mapping_type: params.mapping_type || 'rsm_asm'
        },
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const fetchStdAreaMatrixOptions = async (token: string) => {
    const response = await api.get('/std-area-matrix/options/', {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const saveStdAreaMatrixUserMapping = async (
    token: string,
    data: {
        email: string;
        old_email?: string;
        entries: StdAreaMatrixEntryPayload[];
        replace?: boolean;
    }
) => {
    const response = await api.post('/std-area-matrix/user-mapping/', data, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const deleteStdAreaMatrixUserMapping = async (token: string, email: string) => {
    const response = await api.delete('/std-area-matrix/user-mapping/', {
        params: { email },
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const createStdAreaMatrixRow = async (
    token: string,
    data: { email: string; zone: string; shiptord: string; rd_desc?: string; operator: 'EQ' | 'EX' }
) => {
    const response = await api.post('/std-area-matrix/rows/', data, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const updateStdAreaMatrixRow = async (
    token: string,
    rowId: number,
    data: { email: string; zone: string; shiptord: string; rd_desc?: string; operator: 'EQ' | 'EX' }
) => {
    const response = await api.put(`/std-area-matrix/rows/${rowId}/`, data, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const deleteStdAreaMatrixRow = async (token: string, rowId: number) => {
    const response = await api.delete(`/std-area-matrix/rows/${rowId}/`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

export const exportStdAreaMatrixExcel = async (token: string, params: StdAreaMatrixFilterParams = {}) => {
    const response = await api.get('/std-area-matrix/export-excel/', {
        params: {
            q: params.q || undefined,
            zone: params.zone || undefined,
            operator: params.operator || undefined,
            mapping_type: params.mapping_type || 'rsm_asm'
        },
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
    });
    return response.data;
};
