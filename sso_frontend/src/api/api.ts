import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000/api/v1',
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