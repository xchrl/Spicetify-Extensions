// @ts-chec

// NAME: Spotify Genres
// AUTHOR: Tetrax-10
// DESCRIPTION: See what Genres you are listening to

/// <reference path="../dev/globals.d.ts" />

(async function spotifyGenres() {
    if (!(Spicetify.CosmosAsync && Spicetify.Platform)) {
        setTimeout(spotifyGenres, 300);
        return;
    }

    window.genrePopup = () => {
        genrePopup();
    };

    /////////////////////////////////// CONST ///////////////////////////////////////

    let LFMApiKey = "44654ea047786d90338c17331a5f5d95";
    let unsupportedChar = /[#&+%\\]/g;
    let allGenresForPopupModal = [];
    let lastFmTags = [];

    /////////////////////////////////// CONFIG ///////////////////////////////////////

    function getLocalStorageDataFromKey(key) {
        return Spicetify.LocalStorage.get(key);
    }

    function setLocalStorageDataWithKey(key, value) {
        Spicetify.LocalStorage.set(key, value);
    }

    async function getConfig() {
        try {
            let parsed = JSON.parse(getLocalStorageDataFromKey("showGenre:settings"));
            if (parsed && typeof parsed === "object") {
                return parsed;
            }
            throw "Config Error Show Genre";
        } catch {
            setLocalStorageDataWithKey("showGenre:settings", `{}`);
            return {};
        }
    }

    const defaultSettings = {
        cached: {
            pop: "spotify:playlist:6gS3HhOiI17QNojjPuPzqc",
        },
    };

    let CONFIG = await getConfig();

    async function saveConfig(item, value) {
        if (item) {
            let tempConfig = await getConfig("showGenre:settings");
            tempConfig[item] = value;
            setLocalStorageDataWithKey("showGenre:settings", JSON.stringify(tempConfig));
            return;
        }
        setLocalStorageDataWithKey("showGenre:settings", JSON.stringify(CONFIG));
    }

    Object.keys(defaultSettings).forEach((key) => {
        if (CONFIG[key] == undefined) {
            CONFIG[key] = defaultSettings[key];
        }
    });

    await saveConfig();

    /////////////////////////////////// UTILS ///////////////////////////////////////

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    function camalize(str) {
        return capitalizeFirstLetter(str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase()));
    }

    async function waitForElement(selector, timeout = null, location = document.body) {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            let observer = new MutationObserver(async () => {
                if (document.querySelector(selector)) {
                    resolve(document.querySelector(selector));
                    observer.disconnect();
                } else {
                    if (timeout) {
                        async function timeOver() {
                            return new Promise((resolve) => {
                                setTimeout(() => {
                                    observer.disconnect();
                                    resolve(false);
                                }, timeout);
                            });
                        }
                        resolve(await timeOver());
                    }
                }
            });

            observer.observe(location, {
                childList: true,
                subtree: true,
            });
        });
    }

    async function fetchGenres(artistURI) {
        const res = await Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/artists/${artistURI}`);
        return res.genres;
    }

    // get genre playlist made by "The Sounds of Spotify"
    async function fetchSoundOfSpotifyPlaylist(genre) {
        const cached = CONFIG.cached[camalize(genre)];
        if (cached !== null && cached !== undefined) {
            return cached;
        }

        const re = new RegExp(`^the sound of ${genre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        const res = await Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent("The Sound of " + genre)}&type=playlist`);

        for (const item of res.playlists.items) {
            if (item.owner.id === "thesoundsofspotify" && re.test(item.name)) {
                CONFIG.cached[camalize(genre)] = item.uri;
                await saveConfig("cached", CONFIG.cached);
                return item.uri;
            } else {
                return item.uri + "|||";
            }
        }
        return null;
    }

    function getAllArtistsURIFromCurrentTrack() {
        let metadata = Spicetify.Player.data?.track.metadata;
        let ArtistsURI = [metadata.artist_uri];
        for (let i = 1; i < 10; i++) {
            if (metadata[`artist_uri:${i}`]) {
                ArtistsURI.push(metadata[`artist_uri:${i}`]);
            } else {
                break;
            }
        }
        return ArtistsURI;
    }

    async function getAllArtistsGenres(allArtistURI) {
        let allGenres = allArtistURI.map(async (uri, i) => {
            let artistGenre = await fetchGenres(uri.split(":")[2]);
            return artistGenre;
        });

        allGenres = await Promise.all(allGenres);
        allGenres = allGenres.flat(Infinity);

        if (allGenres.length == 0) {
            let artistRes = await Spicetify.CosmosAsync.get(`wg://artist/v1/${Spicetify.Player.data?.track.metadata.artist_uri.split(":")[2]}/desktop?format=json`);
            if (!artistRes.related_artists.artists) {
                allGenresForPopupModal = [];
                return;
            }
            let tempAllArtistURI = artistRes.related_artists?.artists.map((artist) => artist.uri);

            let count = 5;
            while (count != 25) {
                allGenres = await getAllArtistsGenres(tempAllArtistURI.slice(count - 5, count));
                if (allGenres.length != 0) count = 25;
            }
        }

        allGenres = new Set(allGenres);
        allGenres = allGenresForPopupModal = Array.from(allGenres);
        return allGenres.slice(0, 5);
    }

    async function injectGenre() {
        let allArtistURI = getAllArtistsURIFromCurrentTrack();
        let allGenres = await getAllArtistsGenres(allArtistURI);

        if (!allGenres) return;

        let allGenreElements = allGenres.map(async (genre) => {
            const uri = await fetchSoundOfSpotifyPlaylist(genre);
            if (uri !== null) {
                return [[`<a href="${uri.includes("|||") ? '#"' + ' onclick="genrePopup()" ' : uri + '"'} style="color: var(--spice-subtext); font-size: 12px">${genre}</a>`], [`<span>, </span>`]];
            }
        });

        allGenreElements = await Promise.all(allGenreElements);
        allGenreElements = allGenreElements.flat(Infinity);

        if (allGenreElements[allGenreElements.length - 1] == "<span>, </span>") {
            allGenreElements.pop();
        }

        allGenreElements = allGenreElements.join("");
        genreContainer.innerHTML = allGenreElements;

        infoContainer = await waitForElement("div.main-trackInfo-container");
        infoContainer.appendChild(genreContainer);
    }

    /////////////////////////////////// UI ///////////////////////////////////////

    const { React } = Spicetify;
    const { useState } = React;

    let settingsMenuCSS = React.createElement(
        "style",
        null,
        `.popup-row::after {
                    content: "";
                    display: table;
                    clear: both;
                }
                .popup-row .col {
                    display: flex;
                    padding: 10px 0;
                    align-items: center;
                }
                .popup-row .col.description {
                    float: left;
                    padding-right: 15px;
                }
                .popup-row .col.action {
                    float: right;
                    text-align: right;
                }
                .popup-row .div-title {
                    color: var(--spice-text);
                }                
                .popup-row .divider {
                    height: 2px;
                    border-width: 0;
                    background-color: var(--spice-button-disabled);
                }
                .popup-row .space {
                    margin-bottom: 20px;
                    visibility: hidden;
                }
                .popup-row .info {
                    /* font-size: 13px; */
                }
                .popup-row .red {
                    font-size: 13px;
                    color: #59CE8F;
                }
                .popup-row .demo {
                    font-size: 13px;
                    color: #59CE8F;
                }
                .popup-row .little-space {
                    margin-bottom: 10px;
                }
                .popup-row .inputbox {
                    padding: 10px;
                    border-radius: 15px;
                    border: 0;
                    box-shadow: 4px 4px 10px rgba(0, 0, 0, 0.06);
                }
                button.checkbox {
                    align-items: center;
                    color: var(--spice-text);
                    cursor: pointer;
                    display: flex;
                    margin-inline-start: 12px;
                }
                button.checkbox.disabled {
                    color: rgba(var(--spice-rgb-text), 0.3);
                }
                select {
                    color: var(--spice-text);
                    background: rgba(var(--spice-rgb-shadow), 0.7);
                    border: 0;
                    height: 32px;
                }
                ::-webkit-scrollbar {
                    width: 8px;
                }
                .login-button {
                    background-color: var(--spice-button);
                    border-radius: 8px;
                    border-style: none;
                    color: var(--spice-text);
                    cursor: pointer;
                    font-size: 14px;
                    height: 40px;
                    margin: 10px;
                    padding: 5px 10px;
                    text-align: center;
                }
                .green {
                    background-color: #76ba99;
                    color: #25316D;
                }
                .red {
                    background-color: #A9555E;
                }
                .small-button.red {
                    background-color: #A9555E !important;
                }
                input.small-input {
                    padding: 5px !important;
                    border-radius: 6px !important;
                    right: 0px !important;
                    margin: 5px;
                }
                .small-button {
                    margin-right: 20px;
                }
                .popup-row .inputbox[type="color"] {
                    background-color: var(--spice-custom-main-secondary) !important;
                    padding: 0px;
                    border-radius: 5px !important;
                    border: none;
                    margin-right: 10px;
                }
                .popup-row .inputbox[type="color"]::-webkit-color-swatch {
                    border-radius: 5px !important;
                    border: none;
                }
                .popup-row.search-div .col {
                    position: relative;
                }
                .popup-row .nord-search-container {
                    width: 100%;
                }
                .popup-row .nord-search-icon {
                    position: absolute;
                    margin: 10px;
                }
                .popup-row .nord-search {
                    padding: 10px 36px !important;
                    width: 100%;
                }
                .popup-row .display-none {
                    display: none !important;
                }`
    );

    function ButtonItem({ name, color = "", onclickFun = () => {} }) {
        return React.createElement(
            "button",
            {
                className: `login-button${color}`,
                onClick: async () => {
                    onclickFun();
                },
            },
            name
        );
    }

    function GenreItem() {
        let [value, setValue] = useState(allGenresForPopupModal);

        Spicetify.Player.addEventListener("songchange", () => {
            setTimeout(() => {
                setValue(allGenresForPopupModal);
            }, 500);
        });

        return value.map((name) => {
            return React.createElement(ButtonItem, {
                name: name,
                onclickFun: async () => {
                    let uri = await fetchSoundOfSpotifyPlaylist(name);
                    if (uri === null || uri.includes("|||")) {
                        Spicetify.Platform.History.push(`/search/${name}/playlists`);
                    } else {
                        Spicetify.Platform.History.push(`/playlist/${uri.split(":")[2]}`);
                    }
                    Spicetify.PopupModal.hide();
                },
            });
        });
    }

    // get data from Last.FM
    async function fetchDataFromLastFM(artistName, trackName) {
        let url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LFMApiKey}&artist=${artistName}&track=${trackName}&format=json`;

        try {
            let initialRequest = await fetch(url);
            let response = await initialRequest.json();
            return response;
        } catch (error) {}
    }

    async function updateLastFmTags() {
        let artistName = Spicetify.Player.data.track.metadata["artist_name"];
        let trackName = Spicetify.Player.data.track.metadata["title"];

        if (unsupportedChar.test(artistName) || unsupportedChar.test(trackName)) {
            lastFmTags = [];
            return;
        } else {
            let res = await fetchDataFromLastFM(artistName, trackName);

            lastFmTags = [];

            for (let tag of res.track.toptags.tag) {
                if (!/\d/.test(tag.name)) {
                    lastFmTags.push(tag.name);
                }
            }
        }
    }

    function lastFmTagItem() {
        if (lastFmTags.length == 0) {
            return React.createElement("div", null, null);
        }

        let [value, setValue] = useState(lastFmTags);
        Spicetify.Player.addEventListener("songchange", () => {
            setTimeout(() => {
                setValue(lastFmTags);
            }, 500);
        });

        return React.createElement(
            "div",
            null,
            React.createElement("div", { className: "popup-row" }, React.createElement("hr", { className: "space" }, null)),
            React.createElement("div", { className: "popup-row" }, React.createElement("h1", { className: "div-title" }, "Last FM Tags")),
            value.map((name) => {
                return React.createElement(ButtonItem, {
                    name: name,
                    onclickFun: async () => {
                        Spicetify.Platform.History.push(`/search/${name}/playlists`);
                        Spicetify.PopupModal.hide();
                    },
                });
            })
        );
    }

    let settingsDOMContent = React.createElement(
        "div",
        null,
        settingsMenuCSS,
        React.createElement("p", { className: "popup-row" }, "Tip: You can right click on genres in the Player Bar to open this Popup"),
        React.createElement("div", { className: "popup-row" }, React.createElement("hr", { className: "space" }, null)),
        React.createElement(GenreItem, null, null),
        React.createElement(lastFmTagItem, null, null)
    );

    function genrePopup() {
        Spicetify.PopupModal.display({
            title:
                `Genres of "` +
                Spicetify.Player.data.track.metadata.title
                    .replace(/\(.+?\)/g, "")
                    .replace(/\[.+?\]/g, "")
                    .replace(/\s\-\s.+?$/, "")
                    .replace(/,.+?$/, "")
                    .trim() +
                `"`,
            content: settingsDOMContent,
            isLarge: true,
        });
    }

    /////////////////////////////////// MAIN ///////////////////////////////////////

    let infoContainer, genreContainer;

    (function initMain() {
        if (!Spicetify.Player.data) {
            setTimeout(initMain, 1000);
            return;
        }
        main();
    })();

    async function updateGenres() {
        if (Spicetify.Player.data.track.metadata.is_local || !Spicetify.URI.isTrack(Spicetify.Player.data.track.uri)) {
            infoContainer = await waitForElement("div.main-trackInfo-container");
            try {
                infoContainer.removeChild(genreContainer);
            } catch (error) {}
            return;
        }
        injectGenre();
        updateLastFmTags();
    }

    async function main() {
        infoContainer = await waitForElement("div.main-trackInfo-container");

        genreContainer = document.createElement("div");
        genreContainer.className = "main-trackInfo-genres ellipsis-one-line main-type-finale";

        genreContainer.addEventListener("contextmenu", genrePopup);

        updateGenres();
        Spicetify.Player.addEventListener("songchange", updateGenres);
    }
})();

// Styles of .ellipsis-one-line and .main-type-finale in case lost.

// .ellipsis-one-line {
//     overflow: hidden;
//     text-overflow: ellipsis;
//     white-space: nowrap;
// }
// .main-type-finale {
//     font-size: 0.6875rem;
//     font-weight: 400;
//     font-family: var(--font-family, CircularSp, CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, var(--fallback-fonts, sans-serif));
// }
