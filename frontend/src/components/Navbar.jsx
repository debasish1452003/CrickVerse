import React from 'react';

const Navbar = () => {
    return (
        <nav className="navbar">
            <div className="navbar-brand">
                🏏 <span className="brand-text">CrickVerse</span>
            </div>
            <div className="navbar-links">
                <a href="#live" className="active">Live</a>
                <a href="#upcoming">Upcoming</a>
                <a href="#results">Results</a>
            </div>
        </nav>
    );
};

export default Navbar;