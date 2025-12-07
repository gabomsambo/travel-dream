export default function Footer() {
    return (
        <footer className="py-8 bg-landing-background border-t border-black/5">
            <div className="container mx-auto px-6 text-center text-sm text-landing-secondary/60">
                <p>&copy; {new Date().getFullYear()} Travel Dreams. All rights reserved.</p>
            </div>
        </footer>
    );
}
