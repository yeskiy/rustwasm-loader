import PropTypes from "prop-types";

export const metadata = {
    title: "rust-wasmpack-loader Next.js example",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}

RootLayout.propTypes = {
    children: PropTypes.node,
};
