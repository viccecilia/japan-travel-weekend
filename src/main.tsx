import React from 'react';import ReactDOM from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {AppProvider} from './app/store';import {Router} from './router/Router';import './styles.css';
document.documentElement.lang='zh-CN';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AppProvider><Router/></AppProvider></BrowserRouter></React.StrictMode>);
