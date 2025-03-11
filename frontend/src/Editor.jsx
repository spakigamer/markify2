import React, { useState, useEffect, useRef } from "react";
import MDEditor from "@uiw/react-md-editor";
import Footer from "./Navbar/footer";
import Showdown from "showdown";
import { useNavigate } from "react-router-dom";
import './Editor.css'
import axios from "axios";


const MarkdownEditor = () => {
    const back=import.meta.env.VITE_API_BACK;
    const [markdown, setMarkdown] = useState("");
    const [convertedHtml, setConvertedHtml] = useState("");
    const previewRef = useRef(null);
    const navigate = useNavigate();
    let storedData;
    let message_to_be;

    const converter = new Showdown.Converter({
        sanitize: true,
        ghCompatibleHeaderId: true,
        tables: true,
        simpleLineBreaks: true,
        strikethrough: true,
        tasklists: true,
        openLinksInNewWindow: true,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                storedData = sessionStorage.getItem("userData");
                const token = localStorage.getItem('token');
                console.log(storedData);
                if (!storedData) return;

                const parsedData = JSON.parse(storedData);
                const response = await axios.post(`${back}/search`, parsedData,{headers: {
                    'Authorization': `Bearer ${token}`, // ✅ Send token in headers
                    'Content-Type': 'application/json'
                }});
                const answer = response.data;
                console.log(answer);

                if (answer.message === 'true') {
                    setMarkdown(answer.resultsgot?.marktext || "");
                    storedData=answer.data
                }
            } catch (error) {
                console.error("Error loading markdown from storage", error);
            }
        };

        fetchData();
    }, []);

    useEffect(() => {
        setConvertedHtml(converter.makeHtml(markdown));
    }, [markdown]);

    const handleUpdate = (text) => {
        setMarkdown(text);
    };

    const handleSave = async () => {
        let updatedData = JSON.parse(sessionStorage.getItem('userData'));
        updatedData.marktext = markdown;
    
        const token = localStorage.getItem('token'); // ✅ Get token
    
        if (!token) {
            alert("User not authenticated!");
            return;
        }
    
        console.log("Saving markdown...");
    
        try {
            let result;
            if (updatedData.id == 0) {
                result = await axios.post(`${back}/add`, updatedData, {
                    headers: {
                        'Authorization': `Bearer ${token}`, // ✅ Send token in headers
                        'Content-Type': 'application/json'
                    }
                });
            } else {
                result = await axios.put(`${back}/add`, updatedData, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
            storedData=result.note
            console.log(storedData)
    
            if (result.data.message === "ok") {
                alert("Notes saved successfully!");
                
            } else {
                alert("Notes not saved successfully!");
            }
        } catch (error) {
            console.error("Error saving markdown:", error);
        }
    };

    const handleDownload = () => {
        const blob = new Blob([markdown], { type: "text/markdown" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "markdown_content.md";
        link.click();
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-900 text-white">
            {/* HEADER */}
            <header className="bg-gray-800 p-4 shadow-lg sticky top-0 z-10 flex justify-between items-center">
                <h1 className="text-lg font-bold">Markdown Editor</h1>
                <div className="flex gap-6">
                    <p onClick={() => navigate('/dashboard')} className="cursor-pointer hover:underline">Dashboard</p>
                    <button onClick={() => { localStorage.removeItem("token"); navigate("/login"); }} className="hover:underline">Log out</button>
                </div>
            </header>

            {/* EDITOR & PREVIEW */}
            <div className="flex flex-col md:flex-row flex-grow gap-6 p-6">
                {/* Editor */}
                <div style={{height:'800px'}} className="flex-1 bg-gray-700 p-4 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-2">Editor</h3>
                    <MDEditor
                    height={650}
                        value={markdown}
                        onChange={handleUpdate}
                        childProps={{ textArea: { style: { height: "100vh" } } }}
                    />
                    <div className="flex gap-4 mt-4">
                        <button onClick={handleSave} className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-lg shadow-md">Save</button>
                        <button onClick={handleDownload} className="bg-green-500 hover:bg-green-400 px-4 py-2 rounded-lg shadow-md">Download</button>
                    </div>
                </div>

            </div>
            <Footer />
        </div>
    );
};

export default MarkdownEditor;
