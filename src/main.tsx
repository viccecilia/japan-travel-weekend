import React from 'react';import ReactDOM from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {DemoProvider} from './app/store';import {Router} from './router/Router';import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><DemoProvider><Router/></DemoProvider></BrowserRouter></React.StrictMode>);
